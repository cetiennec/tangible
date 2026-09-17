"""Qwen3-TTS behind the two routes Tangible's hf-endpoint voice provider calls.

The provider asks for /health before anything else, then posts to /generate once
per narration segment and concatenates what comes back. It accepts only
uncompressed 16-bit PCM WAV, and it measures each segment's duration from the
byte count, so the audio must be exactly what it says it is.
"""

from __future__ import annotations

import io
import json
import os
import struct
import threading
from pathlib import Path

import numpy as np
import torch
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

# Inference Endpoints mount the chosen model at /repository and expect the
# container not to download anything. A Space has no such mount, so fall back to
# fetching by name. The same image then works in both places.
MOUNTED = Path("/repository")
MODEL_ID = os.environ.get(
    "QWEN_TTS_MODEL",
    str(MOUNTED) if MOUNTED.is_dir() and any(MOUNTED.iterdir()) else "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
)
# Flash attention needs a long compile; scaled dot-product attention ships with
# torch and is fast enough for building narration.
ATTENTION = os.environ.get("QWEN_TTS_ATTENTION", "sdpa")
DEFAULT_SPEAKER = os.environ.get("QWEN_TTS_SPEAKER", "default")
SPEAKERS_FILE = Path(os.environ.get("QWEN_TTS_SPEAKERS", "speakers/speakers.json"))
# A private Space is reached only through a signed browser URL, so it cannot be
# called as an API. The Space is therefore public and the guarding happens here:
# set ENDPOINT_TOKEN as a Space secret and only that bearer gets through, so a
# cloned voice cannot be driven by anyone who finds the address.
ENDPOINT_TOKEN = os.environ.get("ENDPOINT_TOKEN", "")

app = FastAPI()
_model = None
_lock = threading.Lock()


def speakers() -> dict[str, dict[str, str]]:
    """Reference clips, one per voice the endpoint can imitate."""
    if not SPEAKERS_FILE.exists():
        raise RuntimeError(f"no speaker file at {SPEAKERS_FILE}")
    return json.loads(SPEAKERS_FILE.read_text())


def load() -> object:
    """Load once, on the first request that needs it."""
    global _model
    with _lock:
        if _model is None:
            from qwen_tts import Qwen3TTSModel

            _model = Qwen3TTSModel.from_pretrained(
                MODEL_ID,
                device_map="cuda:0" if torch.cuda.is_available() else "cpu",
                dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
                attn_implementation=ATTENTION,
            )
    return _model


def to_pcm_wav(samples: np.ndarray, sample_rate: int) -> bytes:
    """Mono 16-bit PCM, which is the only thing the provider will accept."""
    audio = np.asarray(samples, dtype=np.float32).reshape(-1)
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 1.0:
        audio = audio / peak
    pcm = np.clip(audio, -1.0, 1.0)
    pcm = (pcm * 32767.0).astype("<i2").tobytes()

    channels, bits = 1, 16
    byte_rate = sample_rate * channels * bits // 8
    block_align = channels * bits // 8
    header = b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVE"
    header += b"fmt " + struct.pack("<IHHIIHH", 16, 1, channels, sample_rate, byte_rate, block_align, bits)
    header += b"data" + struct.pack("<I", len(pcm))
    return header + pcm


class GenerateRequest(BaseModel):
    text: str
    language: str = "English"
    speaker: str = DEFAULT_SPEAKER
    seed: int = 0
    temperature: float = 0.9
    top_p: float = 0.95


def guard(authorization: str | None) -> None:
    if not ENDPOINT_TOKEN:
        return
    expected = f"Bearer {ENDPOINT_TOKEN}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="bad or missing token")


@app.get("/")
def root() -> dict[str, str]:
    """Hugging Face probes this; it says nothing a caller could use."""
    return {"service": "qwen-tts-endpoint"}


@app.get("/health")
def health(authorization: str | None = Header(default=None)) -> dict[str, str]:
    """Answers only once the weights are in memory, so the caller's wait is real."""
    guard(authorization)
    load()
    return {"status": "ready", "model": MODEL_ID}


@app.post("/generate")
def generate(request: GenerateRequest, authorization: str | None = Header(default=None)) -> Response:
    guard(authorization)
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="text is empty")
    voices = speakers()
    voice = voices.get(request.speaker) or voices.get(DEFAULT_SPEAKER)
    if voice is None:
        raise HTTPException(status_code=404, detail=f"unknown speaker {request.speaker!r}")

    model = load()
    # The caller sends a different seed per segment and reuses it on a rebuild,
    # so the same script produces the same narration twice running.
    torch.manual_seed(request.seed)

    arguments = dict(
        text=request.text,
        language=request.language,
        ref_audio=voice["ref_audio"],
        ref_text=voice["ref_text"],
    )
    with _lock:
        try:
            wavs, sample_rate = model.generate_voice_clone(
                **arguments, temperature=request.temperature, top_p=request.top_p
            )
        except TypeError:
            # Older builds of qwen-tts do not take the sampling arguments.
            wavs, sample_rate = model.generate_voice_clone(**arguments)

    first = wavs[0] if isinstance(wavs, (list, tuple)) else wavs
    return Response(content=to_pcm_wav(first, int(sample_rate)), media_type="audio/wav")

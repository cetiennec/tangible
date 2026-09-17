# Qwen3-TTS voice endpoint

Serves Qwen3-TTS behind the two routes Tangible's `hf-endpoint` voice provider
expects, so a lesson can be built with a cloned voice instead of a paid service.

The endpoint is only needed **while a lesson is being built**. Narration is
baked into `audio.webm` and `audio.m4a` and shipped with the lesson, and the
deployed Space never calls a voice model. Run the endpoint for the few minutes a
build takes, and let it scale back to zero afterwards.

## The contract

| route | expects | returns |
|---|---|---|
| `GET /health` | — | 200 once the weights are loaded |
| `POST /generate` | `{text, language, speaker, seed, temperature, top_p}` | mono 16-bit PCM WAV |

The provider measures each segment's length from the WAV byte count, so the
audio must be uncompressed 16-bit PCM. `app.py` converts the model's float
output accordingly; nothing else will be accepted.

## Adding your voice

`speakers/speakers.json` maps a speaker name to a reference clip and its
transcript. Add your own:

```json
{
  "default": { "ref_audio": "https://…/clone.wav", "ref_text": "…" },
  "etienne": { "ref_audio": "speakers/etienne.wav", "ref_text": "Exactly what is said in the clip." }
}
```

Qwen3-TTS clones from roughly three seconds of clean speech. `ref_text` must
match the recording word for word. Paths may be local files in this directory,
URLs, or base64.

## Build and push

```bash
cd tools/qwen-tts-endpoint
docker build -t qwen-tts-endpoint .
hf repos create <namespace>/qwen-tts-endpoint --type model
# push the image to your registry of choice, then point an Inference Endpoint at it
```

## Create the endpoint

Create a Hugging Face Inference Endpoint from the image, on a GPU instance, and
set **scale to zero after a few minutes of inactivity**. The provider sends an
`x-scale-up-timeout` header and waits up to ten minutes on `/health`, so a cold
start is expected and handled.

Qwen3-TTS needs CUDA. It will not run on Apple Silicon, and ZeroGPU cannot serve
it because ZeroGPU only supports the Gradio SDK, not custom HTTP routes.

## Point the lesson at it

In the lesson's gitignored `.env`:

```
TTS_ENDPOINT_URL=https://<your-endpoint>.endpoints.huggingface.cloud
HF_TTS_TOKEN=<a token that may call the endpoint>
```

And in `lesson.yaml`:

```yaml
tts:
  provider: hf-endpoint
  voice: etienne
```

Then `pnpm lesson build --lesson lessons/<id>` without `--offline`. Keep these
values out of the repository and out of Space variables: they are build-time
credentials and must never reach a release artifact.

## Settings worth knowing

| variable | default | purpose |
|---|---|---|
| `QWEN_TTS_MODEL` | `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` | the checkpoint to load |
| `QWEN_TTS_ATTENTION` | `sdpa` | set to `flash_attention_2` if the image has it built |
| `QWEN_TTS_SPEAKER` | `default` | used when a request names no speaker |
| `QWEN_TTS_SPEAKERS` | `speakers/speakers.json` | where the voices are listed |

The provider sends a different seed per segment and the same seeds on a rebuild,
so an unchanged script re-synthesises to the same audio.

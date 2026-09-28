"""Synthesize the teaser's music at 120 BPM, C–G–Am–F, all generated here.

Under the hook it is pad and arpeggio only; the beat plays from the first shot to
the end card, then drops while the music fades out. render.mjs passes the lengths
from the timeline in teaser.js.

Run:   uv run --with numpy --with scipy --with soundfile python make_music.py out.wav LENGTH BEAT_FROM BEAT_TO
"""

import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
LENGTH, BEAT_FROM, BEAT_TO = (float(x) for x in sys.argv[2:5])
N = int(LENGTH * SR)
t = np.arange(N) / SR

CHORDS = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]  # C, G, Am, F (MIDI)
freq = lambda midi: 440.0 * 2 ** ((midi - 69) / 12)
lowpass = lambda x, hz: sosfilt(butter(2, hz, "low", fs=SR, output="sos"), x)
highpass = lambda x, hz: sosfilt(butter(2, hz, "high", fs=SR, output="sos"), x)


def chord_at(bar: int) -> list[int]:
    return CHORDS[bar % len(CHORDS)]


def saw(f: float, tt: np.ndarray) -> np.ndarray:
    return 2 * ((tt * f) % 1) - 1


def envelope(length: int, attack: float, decay: float) -> np.ndarray:
    n = np.arange(length) / SR
    return np.minimum(1, n / max(attack, 1e-4)) * np.exp(-n / decay)


left = np.zeros(N)
right = np.zeros(N)
bars = int(np.ceil(LENGTH / BAR))

# Pad: detuned saws on the chord, one octave lower, softened by a low-pass filter.
pad = np.zeros((2, N))
for bar in range(bars):
    a, b = int(bar * BAR * SR), min(N, int((bar + 1) * BAR * SR))
    tt = t[a:b]
    swell = np.minimum(1, (tt - tt[0]) / 0.25) * np.minimum(1, (tt[-1] - tt + 1e-3) / 0.15)
    for note in chord_at(bar):
        f = freq(note - 12)
        pad[0, a:b] += swell * (saw(f * 2 ** (-7 / 1200), tt) + 0.5 * saw(f * 2, tt))
        pad[1, a:b] += swell * (saw(f * 2 ** (7 / 1200), tt) + 0.5 * saw(f * 2, tt))
left += 0.05 * lowpass(pad[0], 1400)
right += 0.05 * lowpass(pad[1], 1400)

# Arpeggio: eighth notes cycling the chord two octaves up, a soft pluck, panned apart.
step = BEAT / 2
for i in range(int(LENGTH / step)):
    start = int(i * step * SR)
    chord = chord_at(int(i * step / BAR))
    note = [chord[0], chord[1], chord[2], chord[1] + 12][i % 4] + 12
    length = min(N - start, int(0.45 * SR))
    tt = t[start:start + length] - t[start]
    tone = envelope(length, 0.004, 0.16) * (np.sin(2 * np.pi * freq(note) * tt) + 0.3 * np.sin(4 * np.pi * freq(note) * tt))
    pan = 0.35 if i % 2 else -0.35
    left[start:start + length] += 0.11 * tone * (1 - pan)
    right[start:start + length] += 0.11 * tone * (1 + pan)

# Bass: the chord root on every eighth note, from the first shot until the end card.
for i in range(int(BEAT_FROM / step), int(BEAT_TO / step)):
    start = int(i * step * SR)
    length = int(0.24 * SR)
    tt = t[start:start + length] - t[start]
    f = freq(chord_at(int(i * step / BAR))[0] - 24)
    tone = envelope(length, 0.005, 0.12) * lowpass(saw(f, tt) + np.sin(2 * np.pi * f * tt), 500)
    left[start:start + length] += 0.16 * tone
    right[start:start + length] += 0.16 * tone

# Drums: a kick on every beat and a closed hat on the off-beats, while the beat plays.
rng = np.random.default_rng(7)
for i in range(int(BEAT_FROM / BEAT), int(BEAT_TO / BEAT)):
    start = int(i * BEAT * SR)
    length = int(0.3 * SR)
    tt = t[start:start + length] - t[start]
    kick = np.sin(2 * np.pi * (45 * tt + (110 / 18) * (1 - np.exp(-18 * tt)))) * np.exp(-tt / 0.13)
    left[start:start + length] += 0.42 * kick
    right[start:start + length] += 0.42 * kick
    hat_at = int((i * BEAT + BEAT / 2) * SR)
    hat_len = int(0.05 * SR)
    hat = highpass(rng.standard_normal(hat_len), 7000) * np.exp(-np.arange(hat_len) / SR / 0.018)
    left[hat_at:hat_at + hat_len] += 0.05 * hat
    right[hat_at:hat_at + hat_len] += 0.05 * hat

# Master: fade in over the first half second and out over the last two, soft-clip, normalise.
master = np.minimum(1, t / 0.5) * np.minimum(1, (LENGTH - t) / 2.0)
stereo = np.stack([left, right], axis=1) * master[:, None]
stereo = np.tanh(1.4 * stereo)
stereo *= 10 ** (-1 / 20) / np.abs(stereo).max()
sf.write(sys.argv[1], stereo, SR)
print(f"wrote {sys.argv[1]}: {LENGTH} s, {BPM} BPM, beat from {BEAT_FROM} s to {BEAT_TO} s")

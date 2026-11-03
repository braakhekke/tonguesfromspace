#!/usr/bin/env python3
"""Synthesises the sound of the teaser "Where the ice was" (teaser/work/film/sound.wav): wind, one soft shutter tick per year in shot 3, a quiet tone under
the slider and a few sparse notes. Nothing is sampled: every sound is made here, so there is nothing to license. Timings follow CUT in make_film.py.
    python3 scripts/make_film_sound.py && python3 scripts/make_film.py --assemble --audio teaser/work/film/sound.wav"""
import os, sys, wave
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import make_film as mf

SR = 44100
rng = np.random.default_rng(7)
starts, t = [], 0.0
for n, ss, d, sp in mf.CUT:
    starts.append(t); t += d / sp - mf.XF
total = t + mf.XF
N = int(total * SR); out = np.zeros(N)
T = np.arange(N) / SR

def lowpass(x, k):
    c = np.cumsum(np.insert(x, 0, 0)); y = (c[k:] - c[:-k]) / k
    return np.concatenate([np.full(k // 2, y[0]), y, np.full(N - len(y) - k // 2, y[-1])])[:N]

def env(a, b, fi=0.6, fo=0.8):
    e = np.zeros(N); i0, i1 = int(a * SR), min(N, int(b * SR))
    m = np.ones(i1 - i0); fi_n, fo_n = int(fi * SR), int(fo * SR)
    m[:fi_n] *= np.linspace(0, 1, fi_n)[:len(m)]; m[-fo_n:] *= np.linspace(1, 0, fo_n)[:len(m)]
    e[i0:i1] = m; return e

# wind: low-passed noise with a slow swell, a second, higher layer with a different swell
w1 = lowpass(rng.standard_normal(N), 90); w1 /= np.abs(w1).max()
w2 = lowpass(rng.standard_normal(N), 24) - lowpass(rng.standard_normal(N), 140); w2 /= np.abs(w2).max()
swell1 = 0.55 + 0.45 * np.sin(2 * np.pi * T / 11.0 + 1.0); swell2 = 0.5 + 0.5 * np.sin(2 * np.pi * T / 7.3)
out += 0.30 * w1 * swell1 + 0.09 * w2 * swell2

# one soft tick per year in shot 3
y0 = starts[1]
for i in range(11):
    at = y0 + 0.35 + i * (mf.CUT[1][2] / mf.CUT[1][3] - 0.7) / 10; k = int(at * SR)
    if k + 800 < N:
        burst = rng.standard_normal(800) * np.exp(-np.arange(800) / 90.0); burst = burst - lowpass(np.pad(burst, (0, N - 800))[:N], 12)[:800]
        out[k:k + 800] += 0.10 * burst

# the tone under the slider
a, b = starts[2], starts[2] + mf.CUT[2][2] / mf.CUT[2][3]
tone = (np.sin(2 * np.pi * 110 * T) + 0.5 * np.sin(2 * np.pi * 165 * T + 0.3) + 0.25 * np.sin(2 * np.pi * 220 * T)) * env(a, b, 1.5, 1.5)
out += 0.05 * tone

# sparse notes: soft, slightly detuned partials with a long decay
def note(at, f, vel=0.10, dur=5.0):
    k = int(at * SR); n = min(N - k, int(dur * SR))
    if n <= 0: return
    tt = np.arange(n) / SR
    s = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * 2 * f * tt + 0.4) + 0.12 * np.sin(2 * np.pi * 3.01 * f * tt)) * np.exp(-tt / 1.6)
    s *= np.minimum(1, tt / 0.012)
    out[k:k + n] += vel * s
note(starts[0] + 3.2, 220.0); note(starts[0] + 6.0, 329.63, 0.08)           # A3, E4 as the flight lowers
note(starts[2] + 5.0, 277.18, 0.08)                                           # C#4 as the slider reaches the far side
note(starts[4] + 0.4, 220.0, 0.09); note(starts[5] + 0.4, 246.94, 0.08)       # cross-section, photographs
note(starts[-1] + 1.2, 220.0, 0.10); note(starts[-1] + 1.5, 329.63, 0.09); note(starts[-1] + 1.8, 440.0, 0.08)      # the invitation

# the film fades in and out; the last second is silent
out *= env(0, total - 0.8, 1.5, 3.0)
out = out / np.abs(out).max() * 0.55
pcm = (out * 32767).astype(np.int16)
os.makedirs(mf.WORK, exist_ok=True); path = os.path.join(mf.WORK, "sound.wav")
with wave.open(path, "wb") as f:
    f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes(pcm.tobytes())
print("sound:", path, f"{total:.1f} s")

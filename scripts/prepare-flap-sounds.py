"""
Prepare the split-flap sounds the board plays, from recordings of a real display.

  resources/wav/single.wav    one flap flipping several times, about 130 ms apart
  resources/wav/multiple.wav  many flaps falling together, on the same 130 ms beat

From these it writes, to public/sounds/ (served as they are):

  flaps.wav    each separate flap from single.wav, in slots of SLOT_MS
  clatter.wav  each beat of multiple.wav, in slots of SLOT_MS

as 16-bit mono (the recordings' channels are identical). The board cuts the slots apart
again (see flapSound.ts), so the number of flaps or beats can change without code changes:
the board reads how many slots each file has from its length.

Run again after replacing a recording:  python scripts/prepare-flap-sounds.py
Needs numpy.
"""

import os
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCES = os.path.join(HERE, "..", "resources", "wav")
OUT = os.path.join(HERE, "..", "public", "sounds")

# Every sound sits in a slot this long; the board needs the same figure (SOUND_SLOT_MS).
SLOT_MS = 150
# A flap: from just before its hit, for this long, then faded out.
FLAP_MS = 120
# A beat of the clatter: one beat of the recording's own (found from it), a little before its peak.
LEAD_MS = 6


def load(name):
    """A recording as mono floats from -1 to 1, and its sample rate."""
    with wave.open(os.path.join(SOURCES, name)) as w:
        rate, channels, width, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = w.readframes(n)
    if width == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        a = np.where(v >= 1 << 23, v - (1 << 24), v).astype(np.float64) / (1 << 23)
    else:
        a = np.frombuffer(raw, dtype={1: np.uint8, 2: np.int16, 4: np.int32}[width]).astype(np.float64)
        if width == 1:
            a = a - 128
        a /= float(2 ** (8 * width - 1))
    a = a.reshape(-1, channels).mean(axis=1)
    return a - a.mean(), rate


def high_pass(a, rate, cutoff=70.0):
    """Take out rumble below the flaps (first-order, gentle)."""
    rc = 1 / (2 * np.pi * cutoff)
    alpha = rc / (rc + 1 / rate)
    out = np.empty_like(a)
    prev_x = prev_y = 0.0
    for i, x in enumerate(a):
        prev_y = alpha * (prev_y + x - prev_x)
        prev_x = x
        out[i] = prev_y
    return out


def envelope(a, rate, ms=1):
    hop = max(1, int(rate * ms / 1000))
    return np.array([np.sqrt((a[i:i + hop] ** 2).mean()) for i in range(0, len(a) - hop, hop)])


def faded(seg, rate, fade_in_ms, fade_out_ms):
    seg = seg.copy()
    fi, fo = int(rate * fade_in_ms / 1000), int(rate * fade_out_ms / 1000)
    if fi:
        seg[:fi] *= np.linspace(0, 1, fi)
    if fo:
        seg[-fo:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, fo)))
    return seg


def flaps(a, rate):
    """Each flap in single.wav: each peak well above the quiet between flaps, at least 90 ms from the
    last, cut from just before its hit begins (where the level was still under a quarter of the peak)."""
    e = envelope(a, rate, 1)
    floor = np.percentile(e, 20)
    threshold = floor + 0.35 * (e.max() - floor)
    peaks = []
    for i in range(1, len(e) - 1):
        if e[i] >= threshold and e[i] == e[max(0, i - 20):i + 20].max():
            if not peaks or i - peaks[-1] >= 90:
                peaks.append(i)
    found = []
    for p in peaks:
        start = p
        while start > p - 15 and e[start - 1] > e[p] * 0.25:
            start -= 1
        found.append(start)
    # Whole flaps only: not one already under way when the recording starts, nor one it cuts short.
    return [faded(a[int(rate * (t - 2) / 1000):int(rate * (t - 2 + FLAP_MS) / 1000)], rate, 1, 50) for t in found if t >= 30 and t + FLAP_MS < len(e)]


def beats(a, rate):
    """Each beat of multiple.wav: the recording's own beat (its strongest repeat), cut at its peaks."""
    e = envelope(a, rate, 1)
    d = e - e.mean()
    lags = range(60, 260)
    period = max(lags, key=lambda lag: (d[:-lag] * d[lag:]).sum())
    phase = max(range(period), key=lambda p: e[p::period].sum())
    starts = [t - LEAD_MS for t in range(phase, len(e), period) if t - LEAD_MS >= 0 and t - LEAD_MS + period < len(e)]
    length = min(period, SLOT_MS)
    return [faded(a[int(rate * s / 1000):int(rate * (s + length) / 1000)], rate, 2, 12) for s in starts], period


def write(name, sounds, rate):
    slot = int(rate * SLOT_MS / 1000)
    out = np.zeros(slot * len(sounds))
    for i, s in enumerate(sounds):
        s = s[:slot]
        out[i * slot:i * slot + len(s)] = s
    out *= 0.95 / max(1e-9, np.abs(out).max())
    os.makedirs(OUT, exist_ok=True)
    with wave.open(os.path.join(OUT, name), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((out * 32767).astype("<i2").tobytes())


def level(sounds):
    """Bring each sound to the same peak, so none of them stands out (the board varies them itself)."""
    return [s * (0.9 / max(1e-9, np.abs(s).max())) for s in sounds]


single, rate = load("single.wav")
multiple, rate2 = load("multiple.wav")
assert rate == rate2, "the two recordings must have the same sample rate"
single, multiple = high_pass(single, rate), high_pass(multiple, rate)

flap_sounds = level(flaps(single, rate))
beat_sounds, period = beats(multiple, rate)
beat_sounds = level(beat_sounds)
write("flaps.wav", flap_sounds, rate)
write("clatter.wav", beat_sounds, rate)
print(f"flaps.wav: {len(flap_sounds)} flaps; clatter.wav: {len(beat_sounds)} beats of {period} ms; slots of {SLOT_MS} ms at {rate} Hz")

import { describe, expect, it } from "vitest";
import { synthesiseClickSamples } from "./clickSynth";

const RATE = 44100;

/** A repeatable stand-in for Math.random, so every run measures the same clicks. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Energy at each frequency, by a plain discrete Fourier transform (clicks are short). */
function spectrum(samples: Float32Array): { hz: number; energy: number }[] {
  const n = samples.length;
  const bins: { hz: number; energy: number }[] = [];
  for (let k = 1; k < n / 2; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * k * i) / n;
      re += samples[i] * Math.cos(a);
      im -= samples[i] * Math.sin(a);
    }
    bins.push({ hz: (k * RATE) / n, energy: re * re + im * im });
  }
  return bins;
}

function measure(samples: Float32Array) {
  const bins = spectrum(samples);
  const total = bins.reduce((s, b) => s + b.energy, 0);
  return {
    centroid: bins.reduce((s, b) => s + b.hz * b.energy, 0) / total,
    above4k: bins.filter((b) => b.hz >= 4000).reduce((s, b) => s + b.energy, 0) / total,
    below500: bins.filter((b) => b.hz < 500).reduce((s, b) => s + b.energy, 0) / total,
  };
}

describe("the flap's click", () => {
  const clicks = [1, 2, 3, 4].map((seed) => measure(synthesiseClickSamples(RATE, seeded(seed))));
  const average = (key: keyof (typeof clicks)[number]) => clicks.reduce((s, c) => s + c[key], 0) / clicks.length;

  // Measured on 9 Oct 2026: the old, dull click was centred near 1.5 kHz with 8% of its energy
  // above 4 kHz and 62% below 500 Hz. This one is centred near 5.7 kHz, 36% above 4 kHz, 4%
  // below 500 Hz. The checks keep it in that character: bright, but short of a hiss.

  it("is bright, centred in the range where a flap's slap lives, short of hiss", () => {
    expect(average("centroid")).toBeGreaterThan(4500);
    expect(average("centroid")).toBeLessThan(8000);
    expect(average("above4k")).toBeGreaterThan(0.3);
  });

  it("has very little low thud", () => {
    expect(average("below500")).toBeLessThan(0.08);
  });

  it("is short, peaks at the same level every time and never clips", () => {
    for (const seed of [1, 2, 3]) {
      const samples = synthesiseClickSamples(RATE, seeded(seed));
      expect(samples.length / RATE).toBeLessThanOrEqual(0.03);
      expect(Math.max(...samples.map(Math.abs))).toBeCloseTo(0.9, 5);
    }
  });
});

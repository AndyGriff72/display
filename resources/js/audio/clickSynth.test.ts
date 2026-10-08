import { describe, expect, it } from "vitest";
import { SOUND_STYLES, synthesiseClickSamples, type SoundStyle } from "./clickSynth";

const RATE = 44100;

/** A repeatable stand-in for Math.random, so every run measures the same sounds. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Energy at each frequency, by a plain discrete Fourier transform (the sounds are short). */
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
  const share = (lo: number, hi: number) => bins.filter((b) => b.hz >= lo && b.hz < hi).reduce((s, b) => s + b.energy, 0) / total;
  // Within the band that carries the sound, how even the spectrum is: near 1 for noise, near 0
  // for a few pure tones. A slap is noise-like; a click rings.
  const band = bins.filter((b) => b.hz >= 500 && b.hz < 8000).map((b) => b.energy + 1e-12);
  const flatness = Math.exp(band.reduce((s, e) => s + Math.log(e), 0) / band.length) / (band.reduce((s, e) => s + e, 0) / band.length);
  return {
    centroid: bins.reduce((s, b) => s + b.hz * b.energy, 0) / total,
    midBand: share(1000, 4000),
    below500: share(0, 500),
    flatness,
  };
}

function averaged(style: SoundStyle) {
  const runs = [1, 2, 3, 4].map((seed) => measure(synthesiseClickSamples(RATE, seeded(seed), style)));
  const avg = (key: keyof (typeof runs)[number]) => runs.reduce((s, r) => s + r[key], 0) / runs.length;
  return { centroid: avg("centroid"), midBand: avg("midBand"), below500: avg("below500"), flatness: avg("flatness") };
}

// Measured on 9 Oct 2026. The original, dull click: centred near 1.5 kHz, 62% of its energy
// below 500 Hz. The crisp click: centred near 5.7 kHz, tonal (flatness 0.18). The slap: centred
// near 3.5 kHz, 54% of its energy in 1–4 kHz, 4% below 500 Hz, noise-like (flatness 0.46).
// The checks keep each in character.
describe("the slap", () => {
  const slap = averaged("slap");

  it("has most of its energy in the fleshy middle where a slap lives", () => {
    expect(slap.centroid).toBeGreaterThan(2000);
    expect(slap.centroid).toBeLessThan(4500);
    expect(slap.midBand).toBeGreaterThan(0.4);
  });

  it("is noise rather than tones, so it slaps instead of ringing like the click", () => {
    expect(slap.flatness).toBeGreaterThan(averaged("click").flatness * 1.5);
  });

  it("has very little low thud", () => {
    expect(slap.below500).toBeLessThan(0.08);
  });
});

describe("the crisp click", () => {
  it("is bright, short of hiss", () => {
    const click = averaged("click");
    expect(click.centroid).toBeGreaterThan(4500);
    expect(click.centroid).toBeLessThan(8000);
  });
});

describe("every style", () => {
  it.each(SOUND_STYLES)("%s is short, peaks at the same level every time and never clips", (style) => {
    for (const seed of [1, 2, 3]) {
      const samples = synthesiseClickSamples(RATE, seeded(seed), style);
      expect(samples.length / RATE).toBeLessThanOrEqual(0.045);
      expect(Math.max(...samples.map(Math.abs))).toBeCloseTo(0.9, 5);
    }
  });
});

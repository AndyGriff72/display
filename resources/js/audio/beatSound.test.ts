import { describe, expect, it } from "vitest";
import { beatOffsets, beatSound } from "./flapSound";

/** A beat's loudness: each flap's gain times the square root of how many play. */
const loudness = (landed: number) => {
  const { gain, voices } = beatSound(landed);
  return gain * Math.sqrt(voices);
};

describe("beatSound", () => {
  it("plays a lone flap as one light tick, on the beat", () => {
    expect(beatSound(0)).toEqual({ voices: 0, gain: 0, spreadMs: 0 });
    expect(beatSound(1).voices).toBe(1);
    expect(beatSound(1).spreadMs).toBe(0);
    expect(loudness(1)).toBeCloseTo(0.24, 2);
  });

  it("grows louder, denser and wider with more flaps", () => {
    const counts = [1, 3, 6, 12, 24];
    for (let i = 1; i < counts.length; i++) {
      const [a, b] = [beatSound(counts[i - 1]), beatSound(counts[i])];
      expect(loudness(counts[i])).toBeGreaterThan(loudness(counts[i - 1]));
      expect(b.voices).toBeGreaterThanOrEqual(a.voices);
      expect(b.spreadMs).toBeGreaterThan(a.spreadMs);
    }
    expect(loudness(6)).toBeCloseTo(0.54, 2);
    expect(loudness(24)).toBeCloseTo(1);
  });

  it("past full loudness, still sounds denser and wider, up to a limit", () => {
    expect(loudness(200)).toBeCloseTo(1);
    expect(beatSound(200).voices).toBeGreaterThan(beatSound(24).voices);
    expect(beatSound(1000)).toMatchObject({ voices: 16, spreadMs: 25 });
  });
});

describe("beatOffsets", () => {
  it("plays the first flap on the beat and scatters the rest, mostly close behind", () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const offsets = beatOffsets(16, 25, random);
    expect(offsets).toHaveLength(16);
    expect(offsets[0]).toBe(0);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(Math.max(...offsets)).toBeLessThanOrEqual(25);
    // Skewed early: more in the first half of the spread than the second.
    expect(offsets.filter((t) => t < 12.5).length).toBeGreaterThan(offsets.filter((t) => t >= 12.5).length);
  });
});

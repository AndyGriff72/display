import { describe, expect, it } from "vitest";
import { BEAT_TIERS, beatOffsets, beatSound, beatTier, clatterShare } from "./flapSound";

/** A beat's loudness: each flap's gain times the square root of how many play. */
const loudness = (landed: number, ofTotal: number) => {
  const { gain, voices } = beatSound(landed, ofTotal);
  return gain * Math.sqrt(voices);
};

describe("beatSound", () => {
  it("plays a lone flap as one light tick, on the beat", () => {
    expect(beatSound(0, 180)).toEqual({ voices: 0, gain: 0, spreadMs: 0 });
    expect(beatSound(1, 180).voices).toBe(1);
    expect(beatSound(1, 180).spreadMs).toBe(0);
    expect(loudness(1, 180)).toBeCloseTo(0.125, 2);
  });

  it("is full when the whole board lands, and half for a fifth of it", () => {
    expect(loudness(180, 180)).toBeCloseTo(1);
    expect(loudness(36, 180)).toBeCloseTo(0.525, 2);
    expect(loudness(4, 20)).toBeCloseTo(0.525, 2);
  });

  it("dies away all the way down on a big board, rather than staying full until the end", () => {
    // The second page of the departures table: about 100 flaps falling to 4.
    const counts = [101, 80, 60, 40, 29, 22, 13, 7, 4];
    for (let i = 1; i < counts.length; i++) expect(loudness(counts[i], 180)).toBeLessThan(loudness(counts[i - 1], 180));
  });

  it("grows denser and wider with more flaps, up to a limit", () => {
    const counts = [1, 3, 6, 12, 24];
    for (let i = 1; i < counts.length; i++) {
      const [a, b] = [beatSound(counts[i - 1], 180), beatSound(counts[i], 180)];
      expect(b.voices).toBeGreaterThanOrEqual(a.voices);
      expect(b.spreadMs).toBeGreaterThan(a.spreadMs);
    }
    expect(beatSound(1000, 1000)).toMatchObject({ voices: 16, spreadMs: 25 });
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

describe("beatTier", () => {
  it("plays each beat with the ready-made mix nearest its size, exact up to four flaps", () => {
    expect([1, 2, 3, 4].map(beatTier)).toEqual([1, 2, 3, 4]);
    expect(beatTier(5)).toBe(4);
    expect(beatTier(7)).toBe(6);
    expect(beatTier(10)).toBe(11);
    expect(beatTier(16)).toBe(16);
  });

  it("has a ready-made mix for every size a beat can be", () => {
    const sizes = new Set(Array.from({ length: 400 }, (_, i) => beatSound(i + 1, 400).voices));
    for (const size of sizes) expect(Math.abs(beatTier(size) - size)).toBeLessThanOrEqual(2);
    expect(BEAT_TIERS.at(-1)).toBe(Math.max(...sizes));
  });
});

describe("clatterShare", () => {
  it("leaves small beats as separate flaps and blends in more real clatter the busier the beat", () => {
    expect([1, 2, 3, 4].map(clatterShare)).toEqual([0, 0, 0, 0]);
    expect(clatterShare(6)).toBeGreaterThan(0);
    expect(clatterShare(11)).toBeGreaterThan(clatterShare(6));
    expect(clatterShare(16)).toBeCloseTo(0.7);
    expect(clatterShare(100)).toBeCloseTo(0.7);
  });
});

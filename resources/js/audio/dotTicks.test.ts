import { describe, expect, it } from "vitest";
import { dotTickTimes } from "./flapSound";

/** A repeatable stand-in for Math.random. */
function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

describe("dotTickTimes", () => {
  // A sweep across 200 columns of discs, one every 7 ms, as a big board's controller makes.
  const sweep = Array.from({ length: 200 }, (_, i) => i * 7);

  it("plays one to three clicks for each column, as its discs land", () => {
    const ticks = dotTickTimes([0], seeded(3));
    expect(ticks.length).toBeGreaterThanOrEqual(1);
    expect(ticks.length).toBeLessThanOrEqual(3);
    for (const t of ticks) {
      expect(t.at).toBeGreaterThan(110); // around when the disc lands, 120 ms in
      expect(t.at).toBeLessThan(140);
      expect(t.gain).toBeGreaterThan(0.4);
      expect(t.gain).toBeLessThanOrEqual(1);
    }
    const all = dotTickTimes(sweep, seeded(5));
    expect(all.length).toBeGreaterThan(sweep.length * 1.4);
    expect(all.length).toBeLessThan(sweep.length * 2.2);
  });

  it("scatters the clicks, so a sweep is a rattle, not a buzz at the sweep's steady rate", () => {
    const ticks = dotTickTimes(sweep, seeded(7));
    const gaps = ticks.slice(1).map((t, i) => t.at - ticks[i].at);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const spread = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
    // Evenly spaced clicks (the old way: every 7 or 8 ms exactly) would have no spread at all.
    expect(spread / mean).toBeGreaterThan(0.5);
    // And hardly any gap is the sweep's own step.
    expect(gaps.filter((g) => Math.abs(g - 7) < 0.25).length / gaps.length).toBeLessThan(0.1);
  });

  it("comes out in time order", () => {
    const ticks = dotTickTimes(sweep, seeded(11));
    expect(ticks.map((t) => t.at)).toEqual([...ticks.map((t) => t.at)].sort((a, b) => a - b));
  });
});

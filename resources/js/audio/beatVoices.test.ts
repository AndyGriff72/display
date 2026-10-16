import { describe, expect, it } from "vitest";
import { beatVoices } from "./flapSound";

describe("beatVoices", () => {
  it("plays a lone flap as one quiet click and a busy beat as a few, louder overall", () => {
    expect(beatVoices(0)).toEqual({ gain: 0, voices: 0 });
    expect(beatVoices(1)).toEqual({ gain: 0.55, voices: 1 });
    expect(beatVoices(4).voices).toBe(2);
    expect(beatVoices(30).voices).toBe(3);
    // Loudness overall: each voice's gain times the square root of how many.
    const loudness = (n: number) => beatVoices(n).gain * Math.sqrt(beatVoices(n).voices);
    expect(loudness(4)).toBeGreaterThan(loudness(1));
    expect(loudness(30)).toBeGreaterThan(loudness(4));
    expect(loudness(500)).toBeCloseTo(1);
  });
});

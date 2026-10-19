import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlapClock } from "./flapClock";
import { beatStep, type DrumState } from "./useFlapMotion";

const STACK = " ABCDEFGHIJ";
const nextOf = (c: string) => STACK[(STACK.indexOf(c) + 1) % STACK.length];
const drum = (target: string): DrumState => ({ shown: " ", flipping: false, target, nextOf });

describe("beatStep", () => {
  it("starts falling on one beat, then lands a flap on every beat until the face comes round", () => {
    const d = drum("C");
    const landed = Array.from({ length: 5 }, () => beatStep(d));
    expect(landed).toEqual([false, true, true, true, false]);
    expect(d).toMatchObject({ shown: "C", flipping: false });
  });

  it("finishes a falling flap when the target changes under it, and goes on round", () => {
    const d = drum("B");
    beatStep(d); // starts falling from " " to "A"
    d.target = " ";
    expect(beatStep(d)).toBe(true);
    expect(d.shown).toBe("A");
    expect(d.flipping).toBe(true); // carries on round to the blank
  });
});

describe("FlapClock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Cells that join a clock, as useFlapMotion does, and the beats they land on. */
  function board(targets: string[]) {
    const beats: number[] = [];
    const clock = new FlapClock(80, (landed) => beats.push(landed));
    const drums = targets.map((t) => {
      const d = drum(t);
      const step = () => {
        const landed = beatStep(d);
        if (!d.flipping && d.shown === d.target) clock.leave(step);
        return landed;
      };
      clock.join(step);
      return d;
    });
    return { clock, beats, drums };
  }

  it("lands every moving flap on the same beat, thinning out as each reaches its letter", () => {
    const { beats, drums } = board(["A", "C", "C", "E"]);
    vi.advanceTimersByTime(80 * 7);
    expect(drums.map((d) => d.shown).join("")).toBe("ACCE");
    // One beat to start, then: all four land, three, three, one, one.
    expect(beats).toEqual([4, 3, 3, 1, 1]);
  });

  it("is in step: a beat is one moment, never a flap here and a flap there", () => {
    const { beats } = board(Array.from({ length: 20 }, () => "J"));
    vi.advanceTimersByTime(80 * 12);
    expect(beats).toEqual(Array(10).fill(20));
  });

  it("rests when nothing is moving, and starts again when a cell joins", () => {
    const { clock, beats } = board(["A"]);
    vi.advanceTimersByTime(80 * 3);
    expect(vi.getTimerCount()).toBe(0);
    const d = drum("B");
    const step = () => beatStep(d);
    clock.join(step);
    vi.advanceTimersByTime(80 * 3);
    expect(d.shown).toBe("B");
    expect(beats).toEqual([1, 1, 1]);
  });

  it("forgets every cell when stopped", () => {
    const { clock, beats } = board(["J"]);
    vi.advanceTimersByTime(80 * 2);
    clock.stop();
    vi.advanceTimersByTime(80 * 20);
    expect(beats).toEqual([1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts a cell that waits some beats that many beats later, still on the beat", () => {
    const beats: number[] = [];
    const clock = new FlapClock(80, (landed) => beats.push(landed));
    const drums = [drum("B"), drum("B")];
    drums.forEach((d, row) => {
      const step = () => {
        const landed = beatStep(d);
        if (!d.flipping && d.shown === d.target) clock.leave(step);
        return landed;
      };
      clock.join(step, row * 2);
    });
    vi.advanceTimersByTime(80 * 7);
    expect(drums.map((d) => d.shown)).toEqual(["B", "B"]);
    // Row 0 lands on beats 2 and 3; row 1, two beats later, on 4 and 5.
    expect(beats).toEqual([1, 1, 1, 1]);
  });

  it("says when it is busy, and when the last cell has stopped", () => {
    let idle = 0;
    const clock = new FlapClock(80, () => {}, () => idle++);
    expect(clock.busy).toBe(false);
    const d = drum("A");
    const step = () => {
      const landed = beatStep(d);
      if (!d.flipping && d.shown === d.target) clock.leave(step);
      return landed;
    };
    clock.join(step, 1);
    expect(clock.busy).toBe(true);
    vi.advanceTimersByTime(80 * 2);
    expect(idle).toBe(0);
    vi.advanceTimersByTime(80 * 2);
    expect(clock.busy).toBe(false);
    expect(idle).toBe(1);
  });
});

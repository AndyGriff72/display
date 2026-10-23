import { describe, expect, it } from "vitest";
import { judge, MINIMAL_JUMPS, minimalStride, MotionGovernor, type ChangeLoad } from "./motion";
import { validateLayout } from "./layout";

const frames = (ms: number, n = 60) => Array<number>(n).fill(ms);
const smooth: ChangeLoad = { frames: frames(16), late: [2, 3, 1], periodMs: 80 };
const slow: ChangeLoad = { frames: frames(90), late: [10], periodMs: 80 };
const middling: ChangeLoad = { frames: frames(40), late: [5], periodMs: 80 };

function memoryStorage() {
  const items = new Map<string, string>();
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), items };
}

describe("judge", () => {
  it("calls a change of slow frames behind", () => {
    expect(judge(slow)).toBe("behind");
  });

  it("goes by how late split-flap beats reach the screen, when there are beats", () => {
    const beats = (ms: number) => Array<number>(20).fill(ms);
    expect(judge({ frames: frames(16), late: beats(200), periodMs: 80 })).toBe("behind");
    // Slow frames, but beats a beat late at most: the falls run on the graphics card, so fine.
    expect(judge({ frames: frames(60), late: beats(86), periodMs: 80 })).toBe("fine");
    expect(judge({ frames: frames(60), late: beats(35), periodMs: 80 })).toBe("easy");
  });

  it("calls smooth frames and beats on time easy, and in between fine", () => {
    expect(judge(smooth)).toBe("easy");
    expect(judge(middling)).toBe("fine");
  });

  it("does not judge a change too short to tell", () => {
    expect(judge({ frames: frames(90, 5), late: [], periodMs: 80 })).toBe("unknown");
  });

  it("is not thrown by a single long frame", () => {
    expect(judge({ frames: [...frames(16, 59), 900], late: [], periodMs: 80 })).toBe("easy");
  });
});

describe("MotionGovernor", () => {
  it("steps down a level for each change it could not keep up with, no further than minimal", () => {
    const g = new MotionGovernor(memoryStorage());
    g.observe(slow);
    expect(g.level).toBe("lighter");
    g.observe(slow);
    g.observe(slow);
    expect(g.level).toBe("minimal");
  });

  it("steps back up after three easy changes in a row, but not if one in between was only fine", () => {
    const g = new MotionGovernor(memoryStorage());
    g.observe(slow);
    g.observe(smooth);
    g.observe(middling);
    g.observe(smooth);
    g.observe(smooth);
    expect(g.level).toBe("lighter");
    g.observe(smooth);
    expect(g.level).toBe("full");
  });

  it("waits twice as long to step up again when a step up fails at once", () => {
    const g = new MotionGovernor(memoryStorage());
    g.observe(slow);
    for (let i = 0; i < 3; i++) g.observe(smooth);
    expect(g.level).toBe("full");
    g.observe(slow); // the step up was too much
    expect(g.level).toBe("lighter");
    for (let i = 0; i < 5; i++) g.observe(smooth);
    expect(g.level).toBe("lighter");
    g.observe(smooth);
    expect(g.level).toBe("full");
  });

  it("remembers its level on the device for next time", () => {
    const storage = memoryStorage();
    new MotionGovernor(storage).observe(slow);
    expect(new MotionGovernor(storage).level).toBe("lighter");
  });

  it("only records what it sees when the board's motion is fixed", () => {
    const g = new MotionGovernor(memoryStorage());
    g.observe(slow, false);
    expect(g.level).toBe("full");
    expect(g.lastVerdict).toBe("behind");
  });

  it("starts at full when storage has nothing, or nonsense", () => {
    const storage = memoryStorage();
    storage.setItem("display.motion", "{not json");
    expect(new MotionGovernor(storage).level).toBe("full");
    expect(new MotionGovernor(null).level).toBe("full");
  });
});

describe("minimalStride", () => {
  it("gets a split-flap to its character in a few jumps however far it has to go", () => {
    for (const distance of [1, 3, 10, 51]) {
      const stride = minimalStride(distance);
      expect(Math.ceil(distance / stride)).toBeLessThanOrEqual(MINIMAL_JUMPS);
    }
    expect(minimalStride(1)).toBe(1);
  });
});

it("accepts the motion settings in a layout, and nothing else", () => {
  const layout = (motion: unknown) => ({ columns: 4, rows: 1, cell: { type: "splitflap", width: 40, height: 60, motion } }) as never;
  expect(validateLayout(layout("lighter"))).toEqual([]);
  expect(validateLayout(layout("slow")).join(" ")).toContain("motion must be one of");
});

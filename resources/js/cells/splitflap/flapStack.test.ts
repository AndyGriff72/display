import { describe, expect, it } from "vitest";
import { flapIndex, flipsBetween, nextFlap, normalizeStack } from "./flapStack";

const STACK = " ABC123";

describe("flapIndex", () => {
  it("finds a character on the stack", () => {
    expect(flapIndex("B", STACK)).toBe(2);
  });

  it("uses the upper-case flap for lower-case input", () => {
    expect(flapIndex("c", STACK)).toBe(3);
  });

  it("shows the blank for a character the stack has no flap for", () => {
    expect(flapIndex("Z", STACK)).toBe(0);
    expect(flapIndex("é", STACK)).toBe(0);
  });
});

describe("nextFlap", () => {
  it("wraps from the last flap to the first", () => {
    expect(nextFlap(STACK.length - 1, STACK)).toBe(0);
  });
});

describe("flipsBetween", () => {
  it("counts forward flips", () => {
    expect(flipsBetween(1, 4, STACK)).toBe(3);
  });

  it("goes all the way round to reach an earlier flap", () => {
    expect(flipsBetween(4, 1, STACK)).toBe(STACK.length - 3);
  });

  it("is zero when already there", () => {
    expect(flipsBetween(2, 2, STACK)).toBe(0);
  });
});

describe("normalizeStack", () => {
  it("leaves a stack that starts with its blank alone", () => {
    expect(normalizeStack(STACK)).toBe(STACK);
  });

  it("puts back a blank that was trimmed off, so empty cells show blank, not the first letter", () => {
    expect(normalizeStack("ABC123")).toBe(" ABC123");
    expect(flapIndex(" ", normalizeStack("ABC123"))).toBe(0);
  });

  it("moves a blank from elsewhere to the front", () => {
    expect(normalizeStack("AB C")).toBe(" ABC");
  });
});

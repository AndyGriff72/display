import { describe, expect, it } from "vitest";
import { DOTS, SEGMENT_LINES, litSegments, segmentChars, type SegmentCount } from "./segments";

describe.each([7, 14] as SegmentCount[])("%i-segment display", (count) => {
  it("only lights segments the display has", () => {
    const known = new Set([...Object.keys(SEGMENT_LINES[count]), ...Object.keys(DOTS)]);
    for (const ch of segmentChars(count)) {
      for (const seg of litSegments(ch, count)) expect(known, `${ch} uses ${seg}`).toContain(seg);
    }
  });

  it("can show every digit and letter", () => {
    for (const ch of "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ") expect(litSegments(ch, count).size, ch).toBeGreaterThan(0);
  });

  it("shows lower case in upper case and an unknown character blank", () => {
    expect(litSegments("a", count)).toEqual(litSegments("A", count));
    expect(litSegments("é", count).size).toBe(0);
  });
});

it("lights the standard seven-segment digits", () => {
  expect([...litSegments("8", 7)].sort().join("")).toBe("abcdefg");
  expect([...litSegments("1", 7)].sort().join("")).toBe("bc");
});

it("draws N and R full height on seven segments", () => {
  expect([...litSegments("N", 7)].sort().join("")).toBe("abcef");
  expect([...litSegments("R", 7)].sort().join("")).toBe("aef");
});

it("draws a colon with its two dots", () => {
  expect(litSegments(":", 14)).toEqual(new Set(["colonTop", "colonBottom"]));
});

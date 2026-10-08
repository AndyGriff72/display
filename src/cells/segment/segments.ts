/**
 * Segment geometry and character maps for 7- and 14-segment displays.
 *
 * Segment names, drawn on a 60 × 100 face before the slant is applied:
 *
 *      ─── a ───
 *     │ ╲  │  ╱ │
 *     f  h i j  b
 *     │   ╲│╱   │
 *      ─g1─ ─g2─            (g on a 7-segment display)
 *     │   ╱│╲   │
 *     e  k l m  c
 *     │ ╱  │  ╲ │
 *      ─── d ───  dp
 *
 * A seven-segment display only has a–g, so its letters are the usual approximations
 * (b, d, t and so on); words read far better on fourteen segments. N and R are drawn
 * full height, with both segments on each upright, because the short lower-case forms
 * are easily misread.
 */

export type SegmentCount = 7 | 14;

type Line = [x1: number, y1: number, x2: number, y2: number];

const L = 10;
const R = 50;
const TOP = 8;
const MID = 50;
const BOT = 92;
const GAP = 5;
const CX = 30;

const OUTER: Record<string, Line> = {
  a: [L + GAP, TOP, R - GAP, TOP],
  b: [R, TOP + GAP, R, MID - GAP],
  c: [R, MID + GAP, R, BOT - GAP],
  d: [L + GAP, BOT, R - GAP, BOT],
  e: [L, MID + GAP, L, BOT - GAP],
  f: [L, TOP + GAP, L, MID - GAP],
};

export const SEGMENT_LINES: Record<SegmentCount, Record<string, Line>> = {
  7: { ...OUTER, g: [L + GAP, MID, R - GAP, MID] },
  14: {
    ...OUTER,
    g1: [L + GAP, MID, CX - GAP / 2, MID],
    g2: [CX + GAP / 2, MID, R - GAP, MID],
    h: [L + GAP + 1, TOP + GAP + 2, CX - 4, MID - GAP - 1],
    i: [CX, TOP + GAP + 1, CX, MID - GAP],
    j: [R - GAP - 1, TOP + GAP + 2, CX + 4, MID - GAP - 1],
    k: [CX - 4, MID + GAP + 1, L + GAP + 1, BOT - GAP - 2],
    l: [CX, MID + GAP, CX, BOT - GAP - 1],
    m: [CX + 4, MID + GAP + 1, R - GAP - 1, BOT - GAP - 2],
  },
};

/** Stroke width of a segment: fewer, bolder segments on a seven-segment face. */
export const SEGMENT_WIDTH: Record<SegmentCount, number> = { 7: 8, 14: 6 };

/** The decimal point, and the two dots used for a colon. */
export const DOTS = {
  dp: [R + 7, BOT, 3.5],
  colonTop: [CX, 30, 4.5],
  colonBottom: [CX, 70, 4.5],
} as const;

const SEVEN: Record<string, string> = {
  "0": "abcdef", "1": "bc", "2": "abdeg", "3": "abcdg", "4": "bcfg",
  "5": "acdfg", "6": "acdefg", "7": "abc", "8": "abcdefg", "9": "abcdfg",
  A: "abcefg", B: "cdefg", C: "adef", D: "bcdeg", E: "adefg", F: "aefg",
  G: "acdef", H: "bcefg", I: "ef", J: "bcde", K: "bcefg", L: "def",
  M: "ace", N: "abcef", O: "abcdef", P: "abefg", Q: "abcfg", R: "aef",
  S: "acdfg", T: "defg", U: "bcdef", V: "cde", W: "bdf", X: "bcefg",
  Y: "bcdfg", Z: "abdeg",
  "-": "g", _: "d", "=": "dg", "'": "b", '"': "bf", "(": "adef", ")": "abcd", "?": "abeg",
};

const FOURTEEN: Record<string, string[]> = {
  "0": ["a", "b", "c", "d", "e", "f", "j", "k"],
  "1": ["b", "c", "j"],
  "2": ["a", "b", "g1", "g2", "e", "d"],
  "3": ["a", "b", "c", "d", "g2"],
  "4": ["f", "g1", "g2", "b", "c"],
  "5": ["a", "f", "g1", "g2", "c", "d"],
  "6": ["a", "f", "e", "d", "c", "g1", "g2"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g1", "g2"],
  "9": ["a", "b", "c", "d", "f", "g1", "g2"],
  A: ["a", "b", "c", "e", "f", "g1", "g2"],
  B: ["a", "b", "c", "d", "g2", "i", "l"],
  C: ["a", "d", "e", "f"],
  D: ["a", "b", "c", "d", "i", "l"],
  E: ["a", "d", "e", "f", "g1"],
  F: ["a", "e", "f", "g1"],
  G: ["a", "c", "d", "e", "f", "g2"],
  H: ["b", "c", "e", "f", "g1", "g2"],
  I: ["a", "d", "i", "l"],
  J: ["b", "c", "d", "e"],
  K: ["e", "f", "g1", "j", "m"],
  L: ["d", "e", "f"],
  M: ["b", "c", "e", "f", "h", "j"],
  N: ["b", "c", "e", "f", "h", "m"],
  O: ["a", "b", "c", "d", "e", "f"],
  P: ["a", "b", "e", "f", "g1", "g2"],
  Q: ["a", "b", "c", "d", "e", "f", "m"],
  R: ["a", "b", "e", "f", "g1", "g2", "m"],
  S: ["a", "h", "g2", "c", "d"],
  T: ["a", "i", "l"],
  U: ["b", "c", "d", "e", "f"],
  V: ["e", "f", "k", "j"],
  W: ["b", "c", "e", "f", "k", "m"],
  X: ["h", "j", "k", "m"],
  Y: ["h", "j", "l"],
  Z: ["a", "d", "j", "k"],
  "-": ["g1", "g2"],
  _: ["d"],
  "=": ["g1", "g2", "d"],
  "+": ["g1", "g2", "i", "l"],
  "*": ["g1", "g2", "h", "i", "j", "k", "l", "m"],
  "/": ["j", "k"],
  "(": ["j", "m"],
  ")": ["h", "k"],
  "<": ["j", "m"],
  ">": ["h", "k"],
  "'": ["j"],
  '"': ["f", "i"],
  ",": ["k"],
  "?": ["a", "b", "g2", "l"],
  "!": ["i", "dp"],
  "&": ["a", "h", "j", "g1", "e", "d", "m"],
};

/** Characters every segment display can show with its dots alone. */
const DOT_CHARS: Record<string, string[]> = {
  ".": ["dp"],
  ":": ["colonTop", "colonBottom"],
};

/** The segments (and dots) lit for a character, falling back to upper case, then to blank. */
export function litSegments(char: string, count: SegmentCount): Set<string> {
  const lookup = (c: string): string[] | undefined =>
    DOT_CHARS[c] ?? (count === 7 ? SEVEN[c]?.split("") : FOURTEEN[c]);
  return new Set(lookup(char) ?? lookup(char.toUpperCase()) ?? []);
}

/** Every character with a pattern on a display of this many segments, for checking coverage. */
export function segmentChars(count: SegmentCount): string {
  return " " + Object.keys(DOT_CHARS).join("") + Object.keys(count === 7 ? SEVEN : FOURTEEN).join("");
}

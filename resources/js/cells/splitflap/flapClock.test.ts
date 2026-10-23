import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Drum } from "./drum";
import { FlapClock } from "./flapClock";

const STACK = " ABCDEFGHIJ";
const nextOf = (c: string) => STACK[(STACK.indexOf(c) + 1) % STACK.length];
/** A drum showing `from` (the blank unless said), on its way to `to`. */
const drum = (to: string, from = " ", clearFirst = false) => {
  const d = new Drum(" ", nextOf);
  d.shown = from;
  d.target = from;
  d.setTarget(to, clearFirst);
  return d;
};

describe("Drum", () => {
  it("starts falling on one beat, then lands a flap on every beat until the face comes round", () => {
    const d = drum("C");
    const landed = Array.from({ length: 5 }, () => d.step());
    expect(landed).toEqual([false, true, true, true, false]);
    expect(d).toMatchObject({ shown: "C", flipping: false, done: true });
  });

  it("finishes a falling flap when the target changes under it, and goes on round", () => {
    const d = drum("B");
    d.step(); // starts falling from " " to "A"
    d.setTarget(" ");
    expect(d.step()).toBe(true);
    expect(d.shown).toBe("A");
    expect(d.flipping).toBe(true); // carries on round to the blank
  });

  it("clearing, goes round to the blank and waits there until released", () => {
    const d = drum("B", "I", true);
    while (!d.cleared) d.step();
    expect(d.shown).toBe(" ");
    expect(d.done).toBe(false);
    d.release();
    while (!d.done) d.step();
    expect(d.shown).toBe("B");
  });

  it("settles straight to its new face, clearing and all", () => {
    const d = drum("B", "I", true);
    d.settle();
    expect(d).toMatchObject({ shown: "B", done: true, pending: null });
  });
});

describe("FlapClock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Drums on a clock, as the board's cells are, and the beats they land on. */
  function board(drums: { d: Drum; row?: number; wait?: number; clear?: number }[], rowByRow = false) {
    const beats: number[] = [];
    let idle = 0;
    const clock = new FlapClock(80, (landed) => beats.push(landed), () => idle++);
    clock.rowByRow = rowByRow;
    for (const { d, row, wait, clear } of drums) clock.join(d, { row, wait, clear });
    return { clock, beats, idle: () => idle };
  }

  it("lands every moving flap on the same beat, thinning out as each reaches its letter", () => {
    const drums = ["A", "C", "C", "E"].map((t) => ({ d: drum(t) }));
    const { beats } = board(drums);
    vi.advanceTimersByTime(80 * 7);
    expect(drums.map(({ d }) => d.shown).join("")).toBe("ACCE");
    // One beat to start, then: all four land, three, three, one, one.
    expect(beats).toEqual([4, 3, 3, 1, 1]);
  });

  it("is in step: a beat is one moment, never a flap here and a flap there", () => {
    const { beats } = board(Array.from({ length: 20 }, () => ({ d: drum("J") })));
    vi.advanceTimersByTime(80 * 12);
    expect(beats).toEqual(Array(10).fill(20));
  });

  it("rests when nothing is moving, says so, and starts again when a drum joins", () => {
    const { clock, beats, idle } = board([{ d: drum("A") }]);
    expect(clock.busy).toBe(true);
    vi.advanceTimersByTime(80 * 3);
    expect(clock.busy).toBe(false);
    expect(idle()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    const d = drum("B");
    clock.join(d);
    vi.advanceTimersByTime(80 * 3);
    expect(d.shown).toBe("B");
    expect(beats).toEqual([1, 1, 1]);
    expect(idle()).toBe(2);
  });

  it("forgets every drum when stopped", () => {
    const { clock, beats } = board([{ d: drum("J") }]);
    vi.advanceTimersByTime(80 * 2);
    clock.stop();
    vi.advanceTimersByTime(80 * 20);
    expect(beats).toEqual([1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts a drum that waits some beats that many beats later, still on the beat", () => {
    const rows = [drum("B"), drum("B")];
    const { beats } = board(rows.map((d, row) => ({ d, row, wait: row * 2 })));
    vi.advanceTimersByTime(80 * 7);
    expect(rows.map((d) => d.shown)).toEqual(["B", "B"]);
    // Row 0 lands on beats 2 and 3; row 1, two beats later, on 4 and 5.
    expect(beats).toEqual([1, 1, 1, 1]);
  });

  it("row by row, starts each row only once the rows above have finished", () => {
    const top = [drum("C"), drum("A")];
    const below = [drum("B")];
    const { beats } = board([...top.map((d) => ({ d, row: 0 })), ...below.map((d) => ({ d, row: 3 }))], true);
    vi.advanceTimersByTime(80 * 4);
    // The top row: starts, lands 2, lands 1 ("C" still going), lands 1 (done). Nothing below yet.
    expect(below[0].shown).toBe(" ");
    expect(beats).toEqual([2, 1, 1]);
    vi.advanceTimersByTime(80 * 3);
    expect(below[0].shown).toBe("B");
    expect(beats).toEqual([2, 1, 1, 1, 1]);
  });

  it("row by row, finishes the row it is on before going back to a row above", () => {
    const below = drum("D");
    const { clock } = board([{ d: below, row: 2 }], true);
    vi.advanceTimersByTime(80 * 2); // row 2 under way
    const above = drum("A");
    clock.join(above, { row: 0 });
    vi.advanceTimersByTime(80 * 3);
    expect(above.shown).toBe(" "); // waits for row 2
    expect(below.shown).toBe("D");
    vi.advanceTimersByTime(80 * 3);
    expect(above.shown).toBe("A");
  });

  it("clearing a row, sends every drum in it to the blank, and on together only once all are there", () => {
    const row = [drum("B", "C", true), drum("A", "I", true), drum("A", " ", true)];
    board(row.map((d) => ({ d, row: 1 })));
    // "I", near the end of the drum, reaches the blank in two flaps and must wait for "C",
    // which has eight to go; the one already blank waits from the start.
    vi.advanceTimersByTime(80 * 5);
    expect(row[1]).toMatchObject({ shown: " ", cleared: true });
    expect(row[2]).toMatchObject({ shown: " ", cleared: true });
    expect(row[0].shown).not.toBe(" ");
    vi.advanceTimersByTime(80 * 4); // "C" reaches the blank: all released together
    expect(row.every((d) => d.pending === null)).toBe(true);
    vi.advanceTimersByTime(80 * 4);
    expect(row.map((d) => d.shown)).toEqual(["B", "A", "A"]);
    expect(row.every((d) => d.done)).toBe(true);
  });

  it("clearing a whole card row by row, clears all its rows in one turn, then fills them a row at a time, then the next card", () => {
    // Card 1 is rows 0 and 1; card 2 is rows 2 and 3. Each row is one drum, starting on "B".
    const rows = ["C", "D", "E", "F"].map((to) => drum(to, "B", true));
    board(
      rows.map((d, y) => ({ d, row: y * 1000, clear: y < 2 ? 0 : 2000 })),
      true
    );
    // Card 1's rows go round to the blank together; card 2 has not started.
    vi.advanceTimersByTime(80 * 10);
    expect(rows[0]).toMatchObject({ shown: " " });
    expect(rows[1]).toMatchObject({ shown: " " });
    expect(rows[2].shown).toBe("B");
    // Released together, then row 0 fills before row 1 starts.
    vi.advanceTimersByTime(80 * 3);
    expect(rows[0].clearing).toBe(false);
    expect(rows[1].shown).toBe(" ");
    vi.advanceTimersByTime(80 * 30);
    expect(rows.map((d) => d.shown)).toEqual(["C", "D", "E", "F"]);
  });
});

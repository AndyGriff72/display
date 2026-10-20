import { describe, expect, it } from "vitest";
import { printPlan } from "./printing";

/** A row's printing cells from its text: keys "x,y", one per character. */
function row(y: number, text: string) {
  return [...text].map((char, x) => ({ key: `${x},${y}`, char }));
}

describe("printPlan", () => {
  const rows = new Map([
    [0, row(0, "HELLO     ")],
    [1, row(1, "AB        ")],
  ]);
  const keys = new Map([
    [0, "HELLO     "],
    [1, "AB        "],
  ]);

  it("prints each row left to right, a step apart, stopping one past its last character", () => {
    const plan = printPlan(rows, keys, new Set([0, 1]), 20, false);
    expect([0, 1, 2, 3, 4, 5].map((x) => plan.get(`${x},0`)?.at)).toEqual([0, 20, 40, 60, 80, 100]);
    // The trailing blanks after the cursor's last step are not printed.
    expect(plan.has("6,0")).toBe(false);
    expect([0, 1, 2].map((x) => plan.get(`${x},1`)?.at)).toEqual([0, 20, 40]);
    expect(plan.has("3,1")).toBe(false);
    expect(plan.get("0,0")?.key).toBe("HELLO     ");
  });

  it("with rows in turn, starts a changing row once the changing rows above have printed", () => {
    const plan = printPlan(rows, keys, new Set([0, 1]), 20, true);
    // Row 0 prints 6 steps (5 letters and the cursor): row 1 starts at 120 ms.
    expect([0, 1, 2].map((x) => plan.get(`${x},1`)?.at)).toEqual([120, 140, 160]);
    // A row that has not changed does not hold up the rows below.
    const onlyBelow = printPlan(rows, keys, new Set([1]), 20, true);
    expect(onlyBelow.get("0,1")?.at).toBe(0);
  });

  it("prints a full row to its end, and a blank row not at all", () => {
    const plan = printPlan(new Map([[0, row(0, "ABC")], [1, row(1, "   ")]]), new Map([[0, "ABC"], [1, "   "]]), new Set([0, 1]), 10, false);
    expect([0, 1, 2].map((x) => plan.get(`${x},0`)?.at)).toEqual([0, 10, 20]);
    // A blank row: just the cursor's one step at its start.
    expect(plan.get("0,1")?.at).toBe(0);
    expect(plan.has("1,1")).toBe(false);
  });
});

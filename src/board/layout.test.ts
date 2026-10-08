import { describe, expect, it } from "vitest";
import { composeBoard, parseArea, validateLayout, type BoardLayout } from "./layout";

const cell = { type: "splitflap", width: 30, height: 50 } as const;

describe("parseArea", () => {
  it("reads two corners", () => {
    expect(parseArea("0,0 to 19,1")).toEqual({ x1: 0, y1: 0, x2: 19, y2: 1 });
  });

  it("reads a single cell", () => {
    expect(parseArea("5,2")).toEqual({ x1: 5, y1: 2, x2: 5, y2: 2 });
  });

  it("accepts the corners in either order and loose spacing", () => {
    expect(parseArea(" 19 , 1 TO 0,0 ")).toEqual({ x1: 0, y1: 0, x2: 19, y2: 1 });
  });

  it("rejects anything else", () => {
    expect(parseArea("")).toBeNull();
    expect(parseArea("0,0 to")).toBeNull();
    expect(parseArea("a,b to 1,1")).toBeNull();
    expect(parseArea("-1,0 to 1,1")).toBeNull();
  });
});

describe("validateLayout", () => {
  const base: BoardLayout = { columns: 20, rows: 4, cell };

  it("accepts a good layout", () => {
    expect(
      validateLayout({
        ...base,
        statics: [{ id: "logo", area: "0,0 to 3,1" }],
        fields: [{ id: "dest", area: "4,0 to 19,0" }],
      })
    ).toEqual([]);
  });

  it("reports an area off the board", () => {
    const errors = validateLayout({ ...base, statics: [{ id: "logo", area: "0,0 to 20,1" }] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("goes off the board");
  });

  it("reports an area it cannot read", () => {
    expect(validateLayout({ ...base, fields: [{ id: "dest", area: "top row" }] })[0]).toContain("is not an area");
  });

  it("reports a field over a static area", () => {
    expect(
      validateLayout({
        ...base,
        statics: [{ id: "logo", area: "0,0 to 3,1" }],
        fields: [{ id: "dest", area: "0,1 to 19,1" }],
      })
    ).toEqual(['"dest" and "logo" overlap.']);
  });

  it("reports an image fit it does not know", () => {
    const errors = validateLayout({
      ...base,
      statics: [{ id: "logo", area: "0,0 to 3,1", image: "logo.svg", fit: "stretch" as "fill" }],
    });
    expect(errors).toEqual(['Static area "logo": fit must be one of "contain", "cover", "fill".']);
  });

  it("reports overlapping static areas and duplicate ids", () => {
    const errors = validateLayout({
      ...base,
      statics: [
        { id: "a", area: "0,0 to 3,3" },
        { id: "a", area: "3,3 to 5,3" },
      ],
    });
    expect(errors).toContain('Static area "a": another area already has that id.');
    expect(errors).toContain('"a" and "a" overlap.');
  });
});

describe("composeBoard", () => {
  const layout: BoardLayout = {
    columns: 6,
    rows: 2,
    cell,
    statics: [{ id: "logo", area: "0,0 to 1,1" }],
    fields: [
      { id: "left", area: "2,0 to 5,0" },
      { id: "right", area: "2,1 to 5,1", align: "right" },
    ],
  };

  const row = (cells: Map<string, string>, y: number) =>
    Array.from({ length: 6 }, (_, x) => cells.get(`${x},${y}`) ?? "#").join("");

  it("has no cells under a static area", () => {
    const cells = composeBoard(layout, {});
    expect(cells.has("0,0")).toBe(false);
    expect(cells.has("1,1")).toBe(false);
    expect(cells.size).toBe(8);
  });

  it("writes and aligns field text, cutting it to fit", () => {
    const cells = composeBoard(layout, { left: "ABCDEFG", right: "12" });
    expect(row(cells, 0)).toBe("##ABCD");
    expect(row(cells, 1)).toBe("##  12");
  });

  it("centres text", () => {
    const cells = composeBoard({ ...layout, fields: [{ id: "c", area: "2,0 to 5,0", align: "center" }] }, { c: "X" });
    expect(row(cells, 0)).toBe("## X  ");
  });

  it("puts each line of a multi-row field on its own row", () => {
    const cells = composeBoard(
      { columns: 3, rows: 3, cell, fields: [{ id: "f", area: "0,0 to 2,1" }] },
      { f: "AB\nCD\nEF" }
    );
    expect(row(cells, 0).slice(0, 3)).toBe("AB ");
    expect(row(cells, 1).slice(0, 3)).toBe("CD ");
    expect(row(cells, 2).slice(0, 3)).toBe("   ");
  });
});

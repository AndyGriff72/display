import { describe, expect, it } from "vitest";
import {
  composeBoard,
  DEFAULT_HEADER_COLOR,
  headerColours,
  parseArea,
  validateLayout,
  wrapLine,
  type BoardLayout,
  type ListArea,
} from "./layout";

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

  it("reports a cell type or segment count it does not know", () => {
    expect(validateLayout({ ...base, cell: { ...cell, type: "nixie" as "segment" } })[0]).toContain("Cell type must be");
    expect(validateLayout({ ...base, cell: { ...cell, type: "segment", segments: 16 as 14 } })).toEqual([
      "Segments must be 7 or 14.",
    ]);
  });

  it("reports a data row that is not a whole number from 0", () => {
    expect(validateLayout({ ...base, fields: [{ id: "dest", area: "0,0 to 9,0", text: "{destination}", row: -1 }] })).toEqual([
      'Field "dest": row must be a whole number, counting from 0 for the first row of data.',
    ]);
    expect(validateLayout({ ...base, fields: [{ id: "dest", area: "0,0 to 9,0", text: "{destination}", row: 2 }] })).toEqual([]);
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

describe("wrapLine", () => {
  it("leaves a line that fits alone", () => {
    expect(wrapLine("CREWE", 10)).toEqual(["CREWE"]);
  });

  it("wraps at spaces", () => {
    expect(wrapLine("PRESTON, LANCASTER, OXENHOLME", 20)).toEqual(["PRESTON, LANCASTER,", "OXENHOLME"]);
  });

  it("splits a word too long for the width", () => {
    expect(wrapLine("ABCDEFGHIJ KL", 4)).toEqual(["ABCD", "EFGH", "IJ", "KL"]);
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

  it("wraps a long line onto the next row of a multi-row field, but cuts it in a single-row one", () => {
    const multi = composeBoard(
      { columns: 6, rows: 2, cell, fields: [{ id: "f", area: "0,0 to 5,1" }] },
      { f: "CREWE STAFFORD RUGBY" }
    );
    expect(row(multi, 0)).toBe("CREWE ");
    expect(row(multi, 1)).toBe("STAFFO");

    const single = composeBoard({ columns: 6, rows: 1, cell, fields: [{ id: "f", area: "0,0 to 5,0" }] }, { f: "CREWE STAFFORD" });
    expect(row(single, 0)).toBe("CREWE ");
  });

  it("puts each line of a multi-row field on its own row", () => {
    const cells = composeBoard(
      { columns: 3, rows: 3, cell, fields: [{ id: "f", area: "0,0 to 2,1" }] },
      { f: "AB\nCD\nEF" }
    );
    expect(row(cells, 0).slice(0, 3)).toBe("AB ");
    expect(row(cells, 1).slice(0, 3)).toBe("CD ");
    // Row 2 is outside the field: no cells at all.
    expect(row(cells, 2).slice(0, 3)).toBe("###");
  });

  it("gives cells only to fields and lists, so a list starting at row 1 leaves row 0 bare", () => {
    const cells = composeBoard(
      { columns: 4, rows: 3, cell, lists: [{ id: "l", area: "0,1 to 3,2", columns: [{ text: "{a}" }] }] },
      {},
      [{ a: "AB" }]
    );
    expect(row(cells, 0).slice(0, 4)).toBe("####");
    expect(row(cells, 1).slice(0, 4)).toBe("AB  ");
    expect(cells.size).toBe(8);
  });

  it("fills unused positions with blank cells when the layout asks for them", () => {
    const layout: BoardLayout = { columns: 4, rows: 2, cell, unusedCells: "blank", statics: [{ id: "s", area: "3,0 to 3,1" }], fields: [{ id: "f", area: "0,0 to 2,0" }] };
    const cells = composeBoard(layout, { f: "XY" });
    expect(row(cells, 0).slice(0, 4)).toBe("XY #");
    expect(row(cells, 1).slice(0, 4)).toBe("   #");
    expect(validateLayout({ ...layout, unusedCells: "full" as "blank" })).toEqual(['unusedCells must be "empty" or "blank".']);
  });
});

describe("lists", () => {
  const departures = [
    { t: "2026-10-08 14:32:00", dest: "LONDON", plat: "4" },
    { t: "2026-10-08 14:47:00", dest: "MANCHESTER PICCADILLY", plat: "11" },
    { t: "2026-10-08 15:05:00", dest: "EDINBURGH", plat: null },
  ];
  const list: ListArea = {
    id: "deps",
    area: "0,0 to 15,2",
    header: true,
    columns: [
      { title: "TIME", text: "{t|HH:mm}", width: 5 },
      { title: "TO", text: "{dest}", width: 6 },
      { title: "PLAT", text: "{plat}", align: "right" },
    ],
  };
  const layout: BoardLayout = { columns: 16, rows: 3, cell, lists: [list] };
  const lines = (page = 0, records = departures) => {
    const cells = composeBoard(layout, {}, records, page);
    return [0, 1, 2].map((y) => Array.from({ length: 16 }, (_, x) => cells.get(`${x},${y}`)).join(""));
  };

  it("shows a header, then one record per row in columns, cutting text to its column", () => {
    // Widths 5 + 1 + 6 + 1, leaving 3 for the last column, which takes the rest.
    expect(lines()).toEqual([
      "TIME  TO     PLA",
      "14:32 LONDON   4",
      "14:47 MANCHE  11",
    ]);
  });

  it("pages through records that do not fit, looping back to the first page", () => {
    expect(lines(1)[1]).toBe("15:05 EDINBU    ");
    expect(lines(1)[2]).toBe("                ");
    expect(lines(2)[1]).toBe("14:32 LONDON   4");
  });

  it("stays on the first page when every record fits", () => {
    expect(lines(1, departures.slice(0, 2))[1]).toBe("14:32 LONDON   4");
  });

  it("shows only the header when there is no data", () => {
    expect(lines(0, [])).toEqual(["TIME  TO     PLA", " ".repeat(16), " ".repeat(16)]);
  });

  it("colours the header row", () => {
    const colours = headerColours({ ...layout, lists: [{ ...list, headerColor: "#0f0" }] });
    expect(colours.get("0,0")).toBe("#0f0");
    expect(colours.get("15,0")).toBe("#0f0");
    expect(colours.has("0,1")).toBe(false);
    expect(headerColours(layout).get("3,0")).toBe(DEFAULT_HEADER_COLOR);
  });

  it("reports columns wider than the list, a missing width, and no room under a header", () => {
    const base = { columns: 16, rows: 3, cell };
    expect(validateLayout({ ...base, lists: [list] })).toEqual([]);
    expect(validateLayout({ ...base, lists: [{ ...list, columns: [{ text: "{a}", width: 10 }, { text: "{b}", width: 10 }] }] })).toEqual([
      'List "deps": its columns need 21 characters, with a space between each, but it is 16 wide.',
    ]);
    expect(validateLayout({ ...base, lists: [{ ...list, columns: [{ text: "{a}" }, { text: "{b}" }] }] })[0]).toContain(
      "needs a width"
    );
    expect(validateLayout({ ...base, lists: [{ ...list, area: "0,0 to 15,0" }] })[0]).toContain("at least two rows");
  });

  it("reports a list overlapping a field", () => {
    expect(
      validateLayout({ columns: 16, rows: 3, cell, lists: [list], fields: [{ id: "clock", area: "10,2 to 15,2" }] })
    ).toEqual(['"deps" and "clock" overlap.']);
  });

  it("reports a page time that is not a number of seconds", () => {
    expect(validateLayout({ columns: 16, rows: 3, cell, pageSeconds: -1 })[0]).toContain("pageSeconds");
  });
});

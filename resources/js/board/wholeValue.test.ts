import { describe, expect, it } from "vitest";
import { cellSpecs, composeBoard, drumFaces, faceFor, wholeValueFlaps } from "./compose";
import { validateLayout, type BoardLayout } from "./layout";

const cell = { type: "splitflap", width: 30, height: 50 } as const;
const records = [
  { t: "14:32", status: "On time" },
  { t: "14:47", status: "Delayed" },
  { t: "15:05", status: "Cancelled" },
  { t: "15:20", status: "On time" },
];

const field: BoardLayout = {
  columns: 12,
  rows: 1,
  cell,
  unusedCells: "blank",
  fields: [{ id: "status", area: "2,0 to 9,0", text: "{status}", merged: true, align: "center" }],
};

const list: BoardLayout = {
  columns: 12,
  rows: 3,
  cell,
  lists: [
    {
      id: "deps",
      area: "0,0 to 11,2",
      header: true,
      columns: [
        { title: "TIME", text: "{t}", width: 5 },
        { title: "STATUS", text: "{status}", merged: true },
      ],
    },
  ],
};

describe("whole-value flaps", () => {
  it("covers a merged field with one flap instead of cells", () => {
    const specs = cellSpecs(field);
    expect(specs.has("2,0")).toBe(false);
    expect(specs.has("9,0")).toBe(false);
    // Blank cells either side stay.
    expect(specs.has("1,0")).toBe(true);
    expect(specs.has("10,0")).toBe(true);

    const [flap] = wholeValueFlaps(field, { status: "On time" }, records);
    expect(flap).toMatchObject({ rect: { x1: 2, x2: 9, y1: 0, y2: 0 }, value: "On time", align: "center", spec: { type: "splitflap" } });
    expect(flap.values.sort()).toEqual(["Cancelled", "Delayed", "On time"]);
  });

  it("gives each record of a merged list column a flap, keeping its header as cells", () => {
    const specs = cellSpecs(list);
    expect(specs.has("6,0")).toBe(true); // the header
    expect(specs.has("6,1")).toBe(false);
    expect(composeBoard(list, {}, records).get("6,0")).toBe("S");

    const flaps = wholeValueFlaps(list, {}, records, 0);
    expect(flaps.map((f) => [f.rect.y1, f.value])).toEqual([
      [1, "On time"],
      [2, "Delayed"],
    ]);
    // Every row turns the same drum, with every value in the data, not only those on this page.
    expect(new Set(flaps.map((f) => f.drumKey)).size).toBe(1);
    expect(flaps[0].values).toEqual(["On time", "Delayed", "Cancelled"]);
    // The next page.
    expect(wholeValueFlaps(list, {}, records, 1).map((f) => f.value)).toEqual(["Cancelled", "On time"]);
  });

  it("leaves areas drawn as other cell types as cells", () => {
    const dots: BoardLayout = { ...field, fields: [{ ...field.fields![0], cell: { type: "dotmatrix" } }] };
    expect(wholeValueFlaps(dots, { status: "On time" }, records)).toEqual([]);
    expect(cellSpecs(dots).get("2,0")).toMatchObject({ type: "dotmatrix" });
  });

  it("starts a new drum when the template changes", () => {
    const [a] = wholeValueFlaps(field, {}, records);
    const [b] = wholeValueFlaps({ ...field, fields: [{ ...field.fields![0], text: "{t}" }] }, {}, records);
    expect(a.drumKey).not.toBe(b.drumKey);
  });
});

describe("drumFaces", () => {
  it("puts a blank first, then the values alphabetically", () => {
    expect(drumFaces([], ["On time", "Delayed", "Cancelled", ""])).toEqual(["", "Cancelled", "Delayed", "On time"]);
  });

  it("puts the faces given first, in their order, and matches values to them apart from capitals", () => {
    const faces = drumFaces(["ON TIME", "DELAYED"], ["On time", "Delayed", "Cancelled"]);
    expect(faces).toEqual(["", "ON TIME", "DELAYED", "Cancelled"]);
    expect(faceFor("On time", faces)).toBe(1);
    expect(faceFor("Cancelled", faces)).toBe(3);
    expect(faceFor("", faces)).toBe(0);
    expect(faceFor("Diverted", faces)).toBe(0);
  });
});

describe("validating whole-value settings", () => {
  it("reports a merged that is not true or false, and a drum that is not a list of words", () => {
    expect(
      validateLayout({ ...field, fields: [{ ...field.fields![0], merged: "yes" as unknown as boolean, drum: "ON TIME" as unknown as string[] }] })
    ).toEqual([
      'Field "status": merged must be true or false, without quotes.',
      'Field "status": drum must be a list of faces in quotes, e.g. ["ON TIME", "DELAYED"].',
    ]);
    expect(validateLayout(list)).toEqual([]);
  });
});

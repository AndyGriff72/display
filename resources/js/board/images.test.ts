import { describe, expect, it } from "vitest";
import { cellSpecs, drumFaces, faceFor, imageAreas, textBlocks, wholeValueFlaps } from "./compose";
import { imageSource } from "./images";
import { validateLayout, type BoardLayout } from "./layout";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const GIF = "data:image/gif;base64,R0lGODlh";
const records = [
  { op: "AVANTI", logo: PNG },
  { op: "NORTHERN", logo: GIF },
  { op: "MYSTERY", logo: null },
  { op: "AVANTI", logo: PNG },
];

const cell = { type: "splitflap", width: 30, height: 50 } as const;
const list = (type: "splitflap" | "dotmatrix" | "text"): BoardLayout => ({
  columns: 12,
  rows: 3,
  cell: { ...cell, type },
  lists: [
    {
      id: "ops",
      area: "0,0 to 11,2",
      header: true,
      columns: [
        { title: "OPERATOR", text: "{op}", width: 8 },
        { title: "LOGO", text: "{logo}", image: true, fit: "cover" },
      ],
    },
  ],
});

describe("imageSource", () => {
  it("takes images' data: URLs as they are", () => {
    expect(imageSource(PNG)).toBe(PNG);
    expect(imageSource(" data:image/svg+xml;base64,PHN2Zz4= ")).toBe("data:image/svg+xml;base64,PHN2Zz4=");
  });

  it("turns SVG markup into a data: URL", () => {
    const svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    expect(imageSource(svg)).toBe("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
  });

  it("refuses anything else", () => {
    for (const v of ["AVANTI", "", null, 42, "data:text/html,<script>", "https://example.com/logo.png", "<div><svg/></div>"]) {
      expect(imageSource(v)).toBeNull();
    }
  });
});

describe("image columns and fields", () => {
  it("on split-flap, gives each record one flap with the images in the data as its faces", () => {
    const flaps = wholeValueFlaps(list("splitflap"), {}, records, 0);
    expect(flaps.map((f) => [f.rect, f.value, f.image, f.fit])).toEqual([
      [{ x1: 9, x2: 11, y1: 1, y2: 1 }, PNG, true, "cover"],
      [{ x1: 9, x2: 11, y1: 2, y2: 2 }, GIF, true, "cover"],
    ]);
    // Not an image: the blank face.
    expect(flaps[0].values.sort()).toEqual(["", GIF, PNG].sort());
    // The header stays as cells; the records have none.
    const specs = cellSpecs(list("splitflap"));
    expect(specs.has("9,0")).toBe(true);
    expect(specs.has("9,1")).toBe(false);
    expect(imageAreas(list("splitflap"), {}, records)).toEqual([]);
  });

  it("on other cells, draws the images plainly, leaving no cells under them", () => {
    const board = list("dotmatrix");
    expect(imageAreas(board, {}, records, 1)).toEqual([
      { key: "list:ops:1:1", rect: { x1: 9, x2: 11, y1: 1, y2: 1 }, src: null, fit: "cover" },
      { key: "list:ops:1:2", rect: { x1: 9, x2: 11, y1: 2, y2: 2 }, src: PNG, fit: "cover" },
    ]);
    expect(cellSpecs(board).has("9,1")).toBe(false);
    expect(cellSpecs(board).get("9,0")).toMatchObject({ type: "dotmatrix" });
    expect(wholeValueFlaps(board, {}, records)).toEqual([]);
  });

  it("on a text board, draws the images and keeps the header as text", () => {
    const board = list("text");
    expect(imageAreas(board, {}, records).map((a) => a.src)).toEqual([PNG, GIF]);
    expect(textBlocks(board, {}, records).filter((b) => b.key.startsWith("list:ops:1:")).map((b) => b.text)).toEqual(["LOGO"]);
  });

  it("draws a field's image too", () => {
    const board: BoardLayout = { columns: 6, rows: 2, cell: { ...cell, type: "segment" }, fields: [{ id: "logo", area: "0,0 to 3,1", text: "{logo}", image: true }] };
    expect(imageAreas(board, { logo: GIF }, records)).toEqual([{ key: "field:logo", rect: { x1: 0, x2: 3, y1: 0, y2: 1 }, src: GIF, fit: "contain" }]);
  });

  it("compares images exactly, capitals and all", () => {
    const a = "data:image/png;base64,QUJD";
    const b = "data:image/png;base64,qujd";
    const faces = drumFaces([], [a, b], true);
    expect(faces).toHaveLength(3);
    expect(faceFor(b, faces, true)).toBe(faces.indexOf(b));
  });

  it("reports an image or fit setting it cannot use", () => {
    const board = list("splitflap");
    board.lists![0].columns[1] = { text: "{logo}", image: "yes" as unknown as boolean, fit: "squash" as "fill" };
    expect(validateLayout(board)).toEqual([
      'List "ops", column 2: image must be true or false, without quotes.',
      'List "ops", column 2: fit must be one of "contain", "cover", "fill".',
    ]);
  });
});

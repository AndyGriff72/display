/**
 * A board layout: the size of the grid, the kind of cell it is made of, and the areas
 * laid over it. Plain data throughout, so a layout can be stored as JSON and loaded later.
 *
 * Areas are written as inclusive cell coordinates, column first, counting from zero:
 * "0,0 to 19,1" is the first twenty columns of the top two rows. A single cell can be
 * written on its own, e.g. "5,2".
 */

import { pageOffset, renderTemplate, type Row } from "./binding";

export const CELL_TYPES = ["splitflap", "dotmatrix", "segment"] as const;
export type CellType = (typeof CELL_TYPES)[number];

/** How every cell on the board looks. Settings that do not apply to the cell type are ignored. */
export interface CellSettings {
  type: CellType;
  /** Cell size in pixels. */
  width: number;
  height: number;
  /** Space between cells in pixels. */
  gapX?: number;
  gapY?: number;
  /** Character colour: the print on a flap, or a lit LED. Any CSS colour. */
  color?: string;
  /** Split-flap: the typeface. */
  fontFamily?: string;
  /** Split-flap: the flap stack, in drum order. */
  stack?: string;
  /** Split-flap: how long one flap takes to fall, in milliseconds. */
  flipMs?: number;
  /** Segment: 7 for digits, 14 for text. */
  segments?: 7 | 14;
}

/** A fixed part of the board. It has no character cells; it will hold fixed graphics. */
export interface StaticArea {
  id: string;
  area: string;
  /** A logo or other picture: any URL an <img> can load, including a data: URL. */
  image?: string;
  /**
   * How the image fills the area. "contain" (the default) shows all of it, leaving
   * background showing if the shapes differ; "cover" fills the area and crops the
   * overflow; "fill" stretches it to fit.
   */
  fit?: "contain" | "cover" | "fill";
  /** Space between the image and the area's edge, in pixels. */
  padding?: number;
  /** Any CSS colour. Defaults to the board's static panel colour. */
  background?: string;
}

/** A named part of the board that data is written into, e.g. "destination" or "platform". */
export interface FieldArea {
  id: string;
  area: string;
  align?: "left" | "right" | "center";
  /**
   * What the field shows from the board's data source: text with columns in braces, e.g.
   * "PLATFORM {platform}" or "{departs_at|HH:mm}". See binding.ts. A field without one shows
   * whatever text it is given directly.
   */
  text?: string;
  /** Which row of the data the template reads, counting from 0. Defaults to the first. */
  row?: number;
}

/** One column of a list: what it shows for each record, and how many characters wide it is. */
export interface ListColumn {
  /** Shown in the header row, when the list has one. */
  title?: string;
  /** A template, as for fields: "{destination}", "{departs_at|HH:mm}", "PLAT {platform}". */
  text: string;
  /** Characters. The last column may leave it out to take whatever width is left. */
  width?: number;
  align?: "left" | "right" | "center";
}

/**
 * Records as rows: each board row in the area shows one record, laid out in columns, with an
 * optional header row of column titles first. Columns are separated by one blank cell.
 */
export interface ListArea {
  id: string;
  area: string;
  columns: ListColumn[];
  header?: boolean;
  /** Colour of the header row's characters. Any CSS colour; defaults to DEFAULT_HEADER_COLOR. */
  headerColor?: string;
}

/** A warm yellow that stands apart from cream flaps, white or amber LEDs and red segments alike. */
export const DEFAULT_HEADER_COLOR = "#ffcc33";

/** How long each page of records stays up, in seconds, unless the layout says otherwise. */
export const DEFAULT_PAGE_SECONDS = 8;

export interface BoardLayout {
  columns: number;
  rows: number;
  /** The key of the data source the board's fields and lists read from, if any. */
  dataSource?: string;
  /**
   * When there are more records than a list has rows for, the list moves on to the next
   * page of records this often, looping back to the first. 0 keeps the first page up.
   * Defaults to DEFAULT_PAGE_SECONDS.
   */
  pageSeconds?: number;
  /**
   * Page the fields too, one page of records at a time (one record, when every field reads
   * row 0). Off by default: a field reading row 0 is often deliberately "the next one".
   */
  pageFields?: boolean;
  cell: CellSettings;
  statics?: StaticArea[];
  fields?: FieldArea[];
  lists?: ListArea[];
}

/** An area with its corners resolved, inclusive at both ends. */
export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const FITS: string[] = ["contain", "cover", "fill"];

const COORD = /^\s*(\d+)\s*,\s*(\d+)\s*$/;

/**
 * Read an area written as "x1,y1 to x2,y2" (or a single "x,y"). The corners can be given
 * in either order. Returns null if the text is not an area.
 */
export function parseArea(text: string): Rect | null {
  const parts = text.split(/\bto\b/i);
  if (parts.length > 2) return null;
  const corners = parts.map((p) => COORD.exec(p));
  if (corners.some((c) => !c)) return null;
  const [a, b = a] = corners.map((c) => [Number(c![1]), Number(c![2])]);
  return {
    x1: Math.min(a[0], b[0]),
    y1: Math.min(a[1], b[1]),
    x2: Math.max(a[0], b[0]),
    y2: Math.max(a[1], b[1]),
  };
}

export function areaWidth(r: Rect): number {
  return r.x2 - r.x1 + 1;
}

export function areaHeight(r: Rect): number {
  return r.y2 - r.y1 + 1;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x1 <= b.x2 && b.x1 <= a.x2 && a.y1 <= b.y2 && b.y1 <= a.y2;
}

export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;
}

/**
 * Everything wrong with a layout, as messages a person editing it can act on. An empty
 * list means the layout is good to draw.
 */
export function validateLayout(layout: BoardLayout): string[] {
  const errors: string[] = [];
  if (!(layout.columns >= 1) || !(layout.rows >= 1)) {
    errors.push("The board needs at least one column and one row.");
    return errors;
  }

  const { cell } = layout;
  if (!CELL_TYPES.includes(cell?.type)) {
    errors.push(`Cell type must be one of ${CELL_TYPES.map((t) => `"${t}"`).join(", ")}.`);
  }
  if (cell?.segments !== undefined && cell.segments !== 7 && cell.segments !== 14) {
    errors.push("Segments must be 7 or 14.");
  }

  if (layout.pageSeconds !== undefined && !(typeof layout.pageSeconds === "number" && layout.pageSeconds >= 0)) {
    errors.push("pageSeconds must be a number of seconds, or 0 to stay on the first page.");
  }
  if (layout.pageFields !== undefined && typeof layout.pageFields !== "boolean") {
    errors.push("pageFields must be true or false.");
  }

  const seen = new Set<string>();
  const statics: { id: string; rect: Rect }[] = [];
  const fields: { id: string; rect: Rect }[] = [];
  const lists: { id: string; rect: Rect }[] = [];

  const check = (kind: "Static area" | "Field" | "List", id: string, area: string) => {
    if (seen.has(id)) errors.push(`${kind} "${id}": another area already has that id.`);
    seen.add(id);
    const rect = parseArea(area ?? "");
    if (!rect) {
      errors.push(`${kind} "${id}": "${area}" is not an area. Write it as "x1,y1 to x2,y2".`);
      return null;
    }
    if (rect.x2 >= layout.columns || rect.y2 >= layout.rows) {
      errors.push(
        `${kind} "${id}": ${area} goes off the board, which runs from 0,0 to ${layout.columns - 1},${layout.rows - 1}.`
      );
      return null;
    }
    return rect;
  };

  for (const s of layout.statics ?? []) {
    const rect = check("Static area", s.id, s.area);
    if (rect) statics.push({ id: s.id, rect });
    if (s.fit !== undefined && !FITS.includes(s.fit)) {
      errors.push(`Static area "${s.id}": fit must be one of ${FITS.map((f) => `"${f}"`).join(", ")}.`);
    }
  }
  for (const f of layout.fields ?? []) {
    const rect = check("Field", f.id, f.area);
    if (rect) fields.push({ id: f.id, rect });
    if (f.text !== undefined && typeof f.text !== "string") {
      errors.push(`Field "${f.id}": text must be written in quotes, e.g. "{destination}".`);
    }
    if (f.row !== undefined && !(Number.isInteger(f.row) && f.row >= 0)) {
      errors.push(`Field "${f.id}": row must be a whole number, counting from 0 for the first row of data.`);
    }
  }

  for (const l of layout.lists ?? []) {
    const rect = check("List", l.id, l.area);
    if (rect) lists.push({ id: l.id, rect });
    errors.push(...listProblems(l, rect));
  }

  const pairs = (list: { id: string; rect: Rect }[], other: { id: string; rect: Rect }[], same: boolean) => {
    list.forEach((a, i) =>
      (same ? other.slice(i + 1) : other).forEach((b) => {
        if (overlaps(a.rect, b.rect)) errors.push(`"${a.id}" and "${b.id}" overlap.`);
      })
    );
  };
  pairs(statics, statics, true);
  pairs(fields, fields, true);
  pairs(lists, lists, true);
  // A field or list over a static area would be writing into cells that do not exist, and two
  // things writing into the same cells would fight over them.
  pairs(fields, statics, false);
  pairs(lists, statics, false);
  pairs(lists, fields, false);

  return errors;
}

function listProblems(list: ListArea, rect: Rect | null): string[] {
  const name = `List "${list.id}"`;
  if (!Array.isArray(list.columns) || list.columns.length === 0) {
    return [`${name}: give it at least one column, e.g. { "text": "{destination}" }.`];
  }
  const problems: string[] = [];
  list.columns.forEach((c, i) => {
    const which = `${name}, column ${i + 1}`;
    const last = i === list.columns.length - 1;
    if (typeof c?.text !== "string") problems.push(`${which}: text must be written in quotes, e.g. "{destination}".`);
    if (c?.width === undefined) {
      if (!last) problems.push(`${which}: needs a width. Only the last column may take whatever is left.`);
    } else if (!(Number.isInteger(c.width) && c.width >= 1)) {
      problems.push(`${which}: width must be a whole number of characters.`);
    }
  });
  if (rect) {
    const needed = list.columns.reduce((sum, c) => sum + (Number.isInteger(c?.width) ? (c.width as number) : 1), 0) + list.columns.length - 1;
    if (needed > areaWidth(rect)) {
      problems.push(`${name}: its columns need ${needed} characters, with a space between each, but it is ${areaWidth(rect)} wide.`);
    }
    if (list.header && areaHeight(rect) < 2) {
      problems.push(`${name}: with a header row it needs at least two rows, one for the header and one for a record.`);
    }
  }
  return problems;
}

/**
 * What every character cell on the board should show, given the text for each field.
 * Keyed "x,y"; cells under a static area are left out, because they do not exist.
 *
 * A field's text fills its area row by row: each line of the text ("\n" separated) goes
 * on the next row of the area, aligned within it. In a field more than one row high, a line
 * too long for the width wraps at spaces onto the next row, since data from a database
 * comes as one line; in a single-row field it is cut off. Whatever does not fit in the
 * area's height is dropped. Cells in no field or list are blank.
 *
 * A list shows the data's records, one per row, starting from page `page` (see pageOffset).
 */
export function composeBoard(
  layout: BoardLayout,
  values: Record<string, string>,
  records: Row[] = [],
  page = 0
): Map<string, string> {
  const statics = (layout.statics ?? []).map((s) => parseArea(s.area)).filter((r): r is Rect => !!r);
  const cells = new Map<string, string>();

  for (let y = 0; y < layout.rows; y++) {
    for (let x = 0; x < layout.columns; x++) {
      if (!statics.some((r) => contains(r, x, y))) cells.set(`${x},${y}`, " ");
    }
  }

  for (const field of layout.fields ?? []) {
    const rect = parseArea(field.area);
    if (!rect) continue;
    const width = areaWidth(rect);
    const height = areaHeight(rect);
    const text = (values[field.id] ?? "").split("\n");
    const lines = (height > 1 ? text.flatMap((line) => wrapLine(line, width)) : text).slice(0, height);
    lines.forEach((line, row) => {
      const text = alignLine(line, width, field.align ?? "left");
      for (let i = 0; i < width; i++) {
        const key = `${rect.x1 + i},${rect.y1 + row}`;
        if (cells.has(key)) cells.set(key, text[i]);
      }
    });
  }

  for (const list of layout.lists ?? []) {
    const rect = parseArea(list.area);
    if (!rect || !Array.isArray(list.columns)) continue;
    listLines(list, rect, records, page).forEach((line, row) => {
      for (let i = 0; i < line.length; i++) {
        const key = `${rect.x1 + i},${rect.y1 + row}`;
        if (cells.has(key)) cells.set(key, line[i]);
      }
    });
  }

  return cells;
}

/**
 * The text of every row of a list, each exactly the list's width: the header, if it has one,
 * then one record per row from the current page, then blanks for rows with no record.
 */
export function listLines(list: ListArea, rect: Rect, records: Row[], page: number): string[] {
  const width = areaWidth(rect);
  const height = areaHeight(rect);
  const widths = columnWidths(list.columns, width);
  const line = (texts: string[]) =>
    alignLine(texts.map((t, i) => alignLine(t, widths[i], list.columns[i].align ?? "left")).join(" "), width, "left");

  const lines: string[] = [];
  if (list.header) lines.push(line(list.columns.map((c) => c.title ?? "")));
  const perPage = height - lines.length;
  const offset = pageOffset(records.length, perPage, page);
  for (let i = 0; i < perPage; i++) {
    const record = records[offset + i];
    lines.push(record ? line(list.columns.map((c) => renderTemplate(String(c.text ?? ""), record))) : " ".repeat(width));
  }
  return lines;
}

/** Each column's width; a last column with none takes what is left of the list's width. */
function columnWidths(columns: ListColumn[], width: number): number[] {
  const fixed = columns.map((c) => (Number.isInteger(c.width) && (c.width as number) > 0 ? (c.width as number) : 0));
  const used = fixed.reduce((a, b) => a + b, 0) + columns.length - 1;
  return fixed.map((w, i) => (w === 0 ? Math.max(0, i === columns.length - 1 ? width - used : 1) : w));
}

/** Characters in a list's header rows, and the colour each should be. Keyed "x,y". */
export function headerColours(layout: BoardLayout): Map<string, string> {
  const colours = new Map<string, string>();
  for (const list of layout.lists ?? []) {
    const rect = parseArea(list.area);
    if (!rect || !list.header) continue;
    for (let x = rect.x1; x <= rect.x2; x++) colours.set(`${x},${rect.y1}`, list.headerColor ?? DEFAULT_HEADER_COLOR);
  }
  return colours;
}

/**
 * Break a line into pieces no wider than `width`, at spaces where possible. A single word
 * longer than the width is split where it has to be.
 */
export function wrapLine(line: string, width: number): string[] {
  if (line.length <= width) return [line];
  const pieces: string[] = [];
  let current = "";
  for (const word of line.split(" ").filter((w) => w !== "")) {
    if (current && current.length + 1 + word.length <= width) {
      current += " " + word;
      continue;
    }
    if (current) pieces.push(current);
    current = word;
    while (current.length > width) {
      pieces.push(current.slice(0, width));
      current = current.slice(width);
    }
  }
  if (current) pieces.push(current);
  return pieces.length ? pieces : [""];
}

function alignLine(line: string, width: number, align: "left" | "right" | "center"): string {
  const text = line.slice(0, width);
  const spare = width - text.length;
  if (align === "right") return " ".repeat(spare) + text;
  if (align === "center") {
    const before = Math.floor(spare / 2);
    return " ".repeat(before) + text + " ".repeat(spare - before);
  }
  return text + " ".repeat(spare);
}

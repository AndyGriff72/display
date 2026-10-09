/**
 * A board layout: the size of the grid, the kind of cell it is made of, and the areas
 * laid over it. Plain data throughout, so a layout can be stored as JSON and loaded later.
 *
 * Areas are written as inclusive cell coordinates, column first, counting from zero:
 * "0,0 to 19,1" is the first twenty columns of the top two rows. A single cell can be
 * written on its own, e.g. "5,2".
 */

import type { SoundStyle } from "../audio/clickSynth";

export const CELL_TYPES = ["splitflap", "dotmatrix", "segment"] as const;
export type CellType = (typeof CELL_TYPES)[number];

/**
 * What a field or list column can be drawn as: any of the board's cell types, or "text", which
 * is not a grid of characters at all but ordinary text filling the area.
 */
export const AREA_CELL_TYPES = [...CELL_TYPES, "text"] as const;
export type AreaCellType = (typeof AREA_CELL_TYPES)[number];

/** The colour each kind of cell is best known in, used when an area gives none. */
export const DEFAULT_COLOURS: Record<AreaCellType, string> = {
  splitflap: "#f3efe2",
  dotmatrix: "#ffb000",
  segment: "#ff3b1f",
  text: "#f3efe2",
};

/**
 * A field's or list column's own look, over the board's cell settings. Every cell stays the
 * board's width and height, so the grid keeps its pattern; only what is drawn in them changes.
 * Anything left out comes from the board, apart from colour, which for a different type than the
 * board's comes from DEFAULT_COLOURS.
 */
export interface AreaCell {
  type?: AreaCellType;
  /** Character colour (text colour, for text). Any CSS colour. */
  color?: string;
  /** Split-flap and text: the typeface. */
  fontFamily?: string;
  /** Split-flap: the flap stack. */
  stack?: string;
  /** Split-flap: how long one flap takes to fall, in milliseconds. */
  flipMs?: number;
  /** Segment: 7 for digits, 14 for text. */
  segments?: 7 | 14;
  /** Text: size in pixels. Defaults to about 60% of a cell's height. */
  fontSize?: number;
  /**
   * Split-flap: the colour of the flaps. Text: a colour behind the text, which otherwise lets
   * the board show through. (Dot matrix and segments are always drawn on black.)
   */
  background?: string;
}

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

/** A fixed part of the board, with no character cells: a logo or other image, or fixed text. */
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
  /** Any CSS colour. Without one the area is transparent: the board shows through. */
  background?: string;
  /** Colour of a border round the area, any CSS colour. Without one there is no border. */
  border?: string;
  /** Border width in pixels, when there is a border. Defaults to 1. */
  borderWidth?: number;
  /**
   * Fixed text, shown as written (no columns from data: that is what fields are for). One row
   * high it stays on one line and ends "…" when too long; taller, it wraps, and a new line in
   * the text starts a new line.
   */
  text?: string;
  /** Text colour. Any CSS colour; defaults to DEFAULT_COLOURS.text. */
  color?: string;
  /** Text typeface. Defaults to the board's. */
  fontFamily?: string;
  /** Text size in pixels. Defaults to about 60% of a cell's height. */
  fontSize?: number;
  align?: "left" | "right" | "center";
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
  /** Its own cell type and look, instead of the board's. */
  cell?: AreaCell;
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
  /** Its own cell type and look, instead of the board's. */
  cell?: AreaCell;
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
  /**
   * What the board shows where there is no field, list or static area. "empty" (the default)
   * leaves the space bare; "blank" fills it with blank cells, as a real board's unused
   * positions are.
   */
  unusedCells?: "empty" | "blank";
  /**
   * The flap sound on screens showing the board. Browsers only allow sound once someone has
   * clicked or tapped the page, so a screen plays it from its first tap.
   */
  sound?: { enabled?: boolean; volume?: number; style?: SoundStyle };
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
  if (layout.unusedCells !== undefined && layout.unusedCells !== "empty" && layout.unusedCells !== "blank") {
    errors.push('unusedCells must be "empty" or "blank".');
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
    if (s.text !== undefined && typeof s.text !== "string") {
      errors.push(`Static area "${s.id}": text must be written in quotes.`);
    }
    if (s.fontSize !== undefined && !(typeof s.fontSize === "number" && s.fontSize >= 4 && s.fontSize <= 400)) {
      errors.push(`Static area "${s.id}": fontSize must be a number of pixels, from 4 to 400.`);
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
    errors.push(...areaCellProblems(`Field "${f.id}"`, f.cell));
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
    problems.push(...areaCellProblems(which, c?.cell));
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

function areaCellProblems(name: string, cell: AreaCell | undefined): string[] {
  if (cell === undefined) return [];
  if (typeof cell !== "object" || cell === null) return [`${name}: cell must be settings in braces, e.g. { "type": "dotmatrix" }.`];
  const problems: string[] = [];
  if (cell.type !== undefined && !AREA_CELL_TYPES.includes(cell.type)) {
    problems.push(`${name}: cell type must be one of ${AREA_CELL_TYPES.map((t) => `"${t}"`).join(", ")}.`);
  }
  if (cell.segments !== undefined && cell.segments !== 7 && cell.segments !== 14) {
    problems.push(`${name}: segments must be 7 or 14.`);
  }
  if (cell.fontSize !== undefined && !(typeof cell.fontSize === "number" && cell.fontSize >= 4 && cell.fontSize <= 400)) {
    problems.push(`${name}: fontSize must be a number of pixels, from 4 to 400.`);
  }
  return problems;
}

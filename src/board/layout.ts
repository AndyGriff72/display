/**
 * A board layout: the size of the grid, the kind of cell it is made of, and the areas
 * laid over it. Plain data throughout, so a layout can be stored as JSON and loaded later.
 *
 * Areas are written as inclusive cell coordinates, column first, counting from zero:
 * "0,0 to 19,1" is the first twenty columns of the top two rows. A single cell can be
 * written on its own, e.g. "5,2".
 */

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
}

export interface BoardLayout {
  columns: number;
  rows: number;
  cell: CellSettings;
  statics?: StaticArea[];
  fields?: FieldArea[];
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

  const seen = new Set<string>();
  const statics: { id: string; rect: Rect }[] = [];
  const fields: { id: string; rect: Rect }[] = [];

  const check = (kind: "Static area" | "Field", id: string, area: string) => {
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
  // A field over a static area would be writing into cells that do not exist.
  pairs(fields, statics, false);

  return errors;
}

/**
 * What every character cell on the board should show, given the text for each field.
 * Keyed "x,y"; cells under a static area are left out, because they do not exist.
 *
 * A field's text fills its area row by row: each line of the text ("\n" separated) goes
 * on the next row of the area, cut to the area's width and aligned within it. Lines beyond
 * the area's height are dropped. Cells in no field are blank.
 */
export function composeBoard(layout: BoardLayout, values: Record<string, string>): Map<string, string> {
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
    const lines = (values[field.id] ?? "").split("\n").slice(0, areaHeight(rect));
    lines.forEach((line, row) => {
      const text = alignLine(line, width, field.align ?? "left");
      for (let i = 0; i < width; i++) {
        const key = `${rect.x1 + i},${rect.y1 + row}`;
        if (cells.has(key)) cells.set(key, text[i]);
      }
    });
  }

  return cells;
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

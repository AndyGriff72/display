/**
 * From a layout (and its data) to what is drawn: each character cell with the character it
 * shows and how it looks, and the areas drawn as plain text rather than cells.
 *
 * Every cell is the board's width and height, whatever its type, so the grid keeps its pattern.
 * A field or list column can have a cell type of its own (see AreaCell); text areas have no
 * cells at all and are drawn as one block of text over their part of the grid.
 */

import { pageOffset, renderTemplate, type Row } from "./binding";
import {
  areaHeight,
  areaWidth,
  contains,
  DEFAULT_COLOURS,
  DEFAULT_HEADER_COLOR,
  parseArea,
  type AreaCell,
  type BoardLayout,
  type CellSettings,
  type CellType,
  type ListArea,
  type ListColumn,
  type Rect,
} from "./layout";

/** How one character cell looks: everything a cell component needs but its character. */
export interface CellSpec {
  type: CellType;
  color: string;
  fontFamily?: string;
  stack?: string;
  flipMs?: number;
  segments?: 7 | 14;
}

/** How an area drawn as text looks. */
export interface TextSpec {
  color: string;
  fontFamily: string;
  fontSize: number;
  background?: string;
}

/** A piece of text drawn over part of the grid: a text field, or one row of a text column. */
export interface TextBlock {
  key: string;
  rect: Rect;
  text: string;
  align: "left" | "right" | "center";
  /** More than one row high: wraps onto further lines. One row high: one line, ending "…". */
  wrap: boolean;
  style: TextSpec;
}

const FALLBACK_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/** The look of an area's cells, its own settings over the board's; null for a text area. */
export function resolveCell(board: CellSettings, own?: AreaCell): CellSpec | null {
  const type = own?.type ?? board.type;
  if (type === "text") return null;
  const sameType = type === board.type;
  return {
    type,
    color: own?.color ?? (sameType ? board.color : undefined) ?? DEFAULT_COLOURS[type],
    fontFamily: own?.fontFamily ?? board.fontFamily,
    stack: own?.stack ?? board.stack,
    flipMs: own?.flipMs ?? board.flipMs,
    segments: own?.segments ?? board.segments,
  };
}

/** The look of an area drawn as text. */
export function resolveText(board: CellSettings, own?: AreaCell): TextSpec {
  return {
    color: own?.color ?? DEFAULT_COLOURS.text,
    fontFamily: own?.fontFamily ?? board.fontFamily ?? FALLBACK_FONT,
    fontSize: own?.fontSize ?? Math.round(board.height * 0.6),
    background: own?.background,
  };
}

/** Which board columns each list column covers, inclusive. */
export function columnSpans(columns: ListColumn[], rect: Rect): { x1: number; x2: number }[] {
  const widths = columnWidths(columns, areaWidth(rect));
  let x = rect.x1;
  return widths.map((w) => {
    const span = { x1: x, x2: Math.min(x + w - 1, rect.x2) };
    x += w + 1;
    return span;
  });
}

/** Each column's width; a last column with none takes what is left of the list's width. */
function columnWidths(columns: ListColumn[], width: number): number[] {
  const fixed = columns.map((c) => (Number.isInteger(c.width) && (c.width as number) > 0 ? (c.width as number) : 0));
  const used = fixed.reduce((a, b) => a + b, 0) + columns.length - 1;
  return fixed.map((w, i) => (w === 0 ? Math.max(0, i === columns.length - 1 ? width - used : 1) : w));
}

const key = (x: number, y: number) => `${x},${y}`;

/**
 * Which positions have a character cell, and how each looks.
 *
 * Fields and lists have cells (text areas excepted); the rest of the board is bare unless the
 * layout's unusedCells is "blank". The gap between two list columns takes the look of a column
 * beside it that has cells, and is bare between two text columns. A list's header row is drawn
 * in its header colour.
 */
export function cellSpecs(layout: BoardLayout): Map<string, CellSpec> {
  const statics = (layout.statics ?? []).map((s) => parseArea(s.area)).filter((r): r is Rect => !!r);
  const isStatic = (x: number, y: number) => statics.some((r) => contains(r, x, y));
  const board = resolveCell(layout.cell) as CellSpec;
  const specs = new Map<string, CellSpec>();
  const put = (x: number, y: number, spec: CellSpec | null) => {
    if (x < 0 || y < 0 || x >= layout.columns || y >= layout.rows || isStatic(x, y)) return;
    if (spec) specs.set(key(x, y), spec);
    else specs.delete(key(x, y));
  };

  if (layout.unusedCells === "blank") {
    for (let y = 0; y < layout.rows; y++) for (let x = 0; x < layout.columns; x++) put(x, y, board);
  }

  for (const field of layout.fields ?? []) {
    const rect = parseArea(field.area ?? "");
    if (!rect) continue;
    const spec = resolveCell(layout.cell, field.cell);
    for (let y = rect.y1; y <= rect.y2; y++) for (let x = rect.x1; x <= rect.x2; x++) put(x, y, spec);
  }

  for (const list of layout.lists ?? []) {
    const rect = parseArea(list.area ?? "");
    if (!rect || !Array.isArray(list.columns) || list.columns.length === 0) continue;
    const spans = columnSpans(list.columns, rect);
    const looks = list.columns.map((c) => resolveCell(layout.cell, c?.cell));
    // Every position in the list: its column's look, or for a gap, a neighbouring column's.
    const lookAt = (x: number): CellSpec | null => {
      const inside = spans.findIndex((s) => x >= s.x1 && x <= s.x2);
      if (inside >= 0) return looks[inside];
      const before = spans.reduce((last, s, i) => (s.x2 < x ? i : last), -1);
      return (before >= 0 ? looks[before] : null) ?? looks[before + 1] ?? null;
    };
    const headerColour = list.headerColor ?? DEFAULT_HEADER_COLOR;
    for (let y = rect.y1; y <= rect.y2; y++) {
      for (let x = rect.x1; x <= rect.x2; x++) {
        const look = lookAt(x);
        put(x, y, look && list.header && y === rect.y1 ? { ...look, color: headerColour } : look);
      }
    }
  }

  return specs;
}

/**
 * What every character cell shows, given the text for each field and the records for lists,
 * keyed "x,y". Only positions that have a cell (see cellSpecs) appear.
 *
 * A field's text fills its area row by row: each line of the text ("\n" separated) goes on the
 * next row of the area, aligned within it. In a field more than one row high, a line too long
 * for the width wraps at spaces onto the next row, since data from a database comes as one line;
 * in a single-row field it is cut off. Whatever does not fit in the area's height is dropped.
 *
 * A list shows the data's records, one per row, starting from page `page` (see pageOffset).
 */
export function composeBoard(
  layout: BoardLayout,
  values: Record<string, string>,
  records: Row[] = [],
  page = 0
): Map<string, string> {
  const cells = new Map<string, string>();
  for (const k of cellSpecs(layout).keys()) cells.set(k, " ");
  const write = (x: number, y: number, ch: string) => {
    if (cells.has(key(x, y))) cells.set(key(x, y), ch);
  };

  for (const field of layout.fields ?? []) {
    const rect = parseArea(field.area ?? "");
    if (!rect) continue;
    const width = areaWidth(rect);
    const height = areaHeight(rect);
    const text = (values[field.id] ?? "").split("\n");
    const lines = (height > 1 ? text.flatMap((line) => wrapLine(line, width)) : text).slice(0, height);
    lines.forEach((line, row) => {
      const aligned = alignLine(line, width, field.align ?? "left");
      for (let i = 0; i < width; i++) write(rect.x1 + i, rect.y1 + row, aligned[i]);
    });
  }

  for (const list of layout.lists ?? []) {
    const rect = parseArea(list.area ?? "");
    if (!rect || !Array.isArray(list.columns)) continue;
    listLines(list, rect, records, page).forEach((line, row) => {
      for (let i = 0; i < line.length; i++) write(rect.x1 + i, rect.y1 + row, line[i]);
    });
  }

  return cells;
}

/** The records a list shows on page `page`, one per row after any header; null for an empty row. */
function pageOfRecords(list: ListArea, rect: Rect, records: Row[], page: number): (Row | null)[] {
  const perPage = areaHeight(rect) - (list.header ? 1 : 0);
  const offset = pageOffset(records.length, perPage, page);
  return Array.from({ length: Math.max(0, perPage) }, (_, i) => records[offset + i] ?? null);
}

/**
 * The text of every row of a list, each exactly the list's width: the header, if it has one,
 * then one record per row from the current page, then blanks for rows with no record.
 */
export function listLines(list: ListArea, rect: Rect, records: Row[], page: number): string[] {
  const width = areaWidth(rect);
  const widths = columnWidths(list.columns, width);
  const line = (texts: string[]) =>
    alignLine(texts.map((t, i) => alignLine(t, widths[i], list.columns[i].align ?? "left")).join(" "), width, "left");

  const lines: string[] = [];
  if (list.header) lines.push(line(list.columns.map((c) => c.title ?? "")));
  for (const record of pageOfRecords(list, rect, records, page)) {
    lines.push(record ? line(list.columns.map((c) => renderTemplate(String(c.text ?? ""), record))) : " ".repeat(width));
  }
  return lines;
}

/**
 * The areas drawn as text: text fields, and each row of each text column of a list. A text
 * field shows its whole text, not cut to its width in cells; a text column likewise.
 */
export function textBlocks(layout: BoardLayout, values: Record<string, string>, records: Row[] = [], page = 0): TextBlock[] {
  const blocks: TextBlock[] = [];

  for (const field of layout.fields ?? []) {
    if ((field.cell?.type ?? layout.cell.type) !== "text") continue;
    const rect = parseArea(field.area ?? "");
    if (!rect) continue;
    blocks.push({
      key: `field:${field.id}`,
      rect,
      text: values[field.id] ?? "",
      align: field.align ?? "left",
      wrap: areaHeight(rect) > 1,
      style: resolveText(layout.cell, field.cell),
    });
  }

  for (const list of layout.lists ?? []) {
    const rect = parseArea(list.area ?? "");
    if (!rect || !Array.isArray(list.columns)) continue;
    const spans = columnSpans(list.columns, rect);
    const rows = pageOfRecords(list, rect, records, page);
    list.columns.forEach((column, j) => {
      if ((column?.cell?.type ?? layout.cell.type) !== "text") return;
      const style = resolveText(layout.cell, column.cell);
      const block = (y: number, text: string, colour?: string) =>
        blocks.push({
          key: `list:${list.id}:${j}:${y}`,
          rect: { x1: spans[j].x1, x2: spans[j].x2, y1: y, y2: y },
          text,
          align: column.align ?? "left",
          wrap: false,
          style: colour ? { ...style, color: colour } : style,
        });
      let y = rect.y1;
      if (list.header) block(y++, column.title ?? "", list.headerColor ?? DEFAULT_HEADER_COLOR);
      for (const record of rows) block(y++, record ? renderTemplate(String(column.text ?? ""), record) : "");
    });
  }

  return blocks;
}

/** Characters in a list's header rows, and the colour each should be. Keyed "x,y". */
export function headerColours(layout: BoardLayout): Map<string, string> {
  const colours = new Map<string, string>();
  for (const list of layout.lists ?? []) {
    const rect = parseArea(list.area);
    if (!rect || !list.header) continue;
    for (let x = rect.x1; x <= rect.x2; x++) colours.set(key(x, rect.y1), list.headerColor ?? DEFAULT_HEADER_COLOR);
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

/** Every typeface the board draws with, so the page can load them. */
export function fontsUsed(layout: BoardLayout): string[] {
  const families = new Set<string>();
  if (layout.cell.fontFamily) families.add(layout.cell.fontFamily);
  const add = (cell?: AreaCell) => cell?.fontFamily && families.add(cell.fontFamily);
  (layout.fields ?? []).forEach((f) => add(f.cell));
  (layout.lists ?? []).forEach((l) => (Array.isArray(l.columns) ? l.columns : []).forEach((c) => add(c?.cell)));
  return [...families];
}


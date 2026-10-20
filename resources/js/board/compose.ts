/**
 * From a layout (and its data) to what is drawn: each character cell with the character it
 * shows and how it looks, and the areas drawn as plain text rather than cells.
 *
 * Every cell is the board's width and height, whatever its type, so the grid keeps its pattern.
 * A field or list column can have a cell type of its own (see AreaCell); text areas have no
 * cells at all and are drawn as one block of text over their part of the grid.
 */

import { pageOffset, renderTemplate, type Row } from "./binding";
import { plainText } from "./plainText";
import {
  areaHeight,
  areaWidth,
  cardRects,
  columnOffsets,
  contains,
  DEFAULT_COLOURS,
  DEFAULT_HEADER_COLOR,
  DEFAULT_LINE_HEIGHT,
  FINISH_COLOURS,
  type Finish,
  parseArea,
  type AreaCell,
  type BoardLayout,
  type CellSettings,
  type CellType,
  type FieldArea,
  type ListArea,
  type ListColumn,
  type Rect,
  type StaticArea,
  type ImageValue,
  type TurnBy,
  type WholeValue,
} from "./layout";
import { imageSource } from "./images";

/** How one character cell looks: everything a cell component needs but its character. */
export interface CellSpec {
  /** Any type but text, which has no cells. */
  type: Exclude<CellType, "text">;
  color: string;
  fontFamily?: string;
  stack?: string;
  flipMs?: number;
  segments?: 7 | 14;
  /** Split-flap: the flaps' colour. Flip-dot: the discs' dark side. */
  background?: string;
  /** Dot matrix and segment: how they are drawn. */
  finish?: Finish;
}

/** How an area drawn as text looks. */
export interface TextSpec {
  color: string;
  fontFamily: string;
  fontSize: number;
  background?: string;
  /** Extra space between characters, in pixels. */
  letterSpacing: number;
  /** Line height, as a multiple of the font size. */
  lineHeight: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
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
  // A finish of the area's own, or the board's when the area uses the board's kind of cell.
  const finish = type === "dotmatrix" || type === "segment" ? (own?.finish ?? (sameType ? board.finish : undefined)) : undefined;
  return {
    type,
    // Its own colour; else, if it chose a finish, that finish's colour; else the board's.
    color:
      own?.color ??
      (own?.finish ? FINISH_COLOURS[own.finish] : undefined) ??
      (sameType ? board.color : undefined) ??
      (finish ? FINISH_COLOURS[finish] : undefined) ??
      DEFAULT_COLOURS[type],
    finish: finish === "bulb" && type !== "dotmatrix" ? "led" : finish,
    fontFamily: own?.fontFamily ?? board.fontFamily,
    stack: own?.stack ?? board.stack,
    flipMs: own?.flipMs ?? board.flipMs,
    segments: own?.segments ?? board.segments,
    background: type === "splitflap" || type === "flipdot" ? own?.background : undefined,
  };
}

/** The look of an area drawn as text. */
export function resolveText(board: CellSettings, own?: AreaCell): TextSpec {
  // A text board's own settings apply to its text areas; another kind of board's do not.
  const boardText = board.type === "text";
  return {
    color: own?.color ?? (boardText ? board.color : undefined) ?? DEFAULT_COLOURS.text,
    fontFamily: own?.fontFamily ?? board.fontFamily ?? FALLBACK_FONT,
    fontSize: own?.fontSize ?? (boardText ? board.fontSize : undefined) ?? Math.round(board.height * 0.6),
    background: own?.background ?? (boardText ? board.background : undefined),
    letterSpacing: own?.letterSpacing ?? (boardText ? board.letterSpacing : undefined) ?? 0,
    lineHeight: own?.lineHeight ?? (boardText ? board.lineHeight : undefined) ?? DEFAULT_LINE_HEIGHT,
    bold: own?.bold ?? (boardText ? board.bold : undefined) ?? false,
    italic: own?.italic ?? (boardText ? board.italic : undefined) ?? false,
    underline: own?.underline ?? (boardText ? board.underline : undefined) ?? false,
  };
}

/** How a static area's text looks: its own settings, the board's typeface, sized from the cells. */
export function resolveStaticText(board: CellSettings, s: StaticArea): TextSpec {
  return {
    color: s.color ?? DEFAULT_COLOURS.text,
    fontFamily: s.fontFamily ?? board.fontFamily ?? FALLBACK_FONT,
    fontSize: s.fontSize ?? Math.round(board.height * 0.6),
    letterSpacing: 0,
    lineHeight: DEFAULT_LINE_HEIGHT,
    bold: !!s.bold,
    italic: !!s.italic,
    underline: !!s.underline,
  };
}

/**
 * Which board columns each list column covers, inclusive (see columnOffsets), cut to the list's
 * right edge. A column that starts beyond the edge has x2 < x1: nothing to draw.
 */
export function columnSpans(columns: ListColumn[], rect: Rect): { x1: number; x2: number }[] {
  return columnOffsets(columns, areaWidth(rect)).map(({ start, width }) => ({
    x1: rect.x1 + start,
    x2: Math.min(rect.x1 + start + width - 1, rect.x2),
  }));
}

const key = (x: number, y: number) => `${x},${y}`;

/**
 * Which positions have a character cell, and how each looks.
 *
 * Fields and list columns have cells (text areas excepted); the rest of the board, including the
 * space between a list's columns, is bare unless the layout's unusedCells is "blank". A list's
 * header row is drawn in its header colour.
 */
export function cellSpecs(layout: BoardLayout): Map<string, CellSpec> {
  const statics = (layout.statics ?? []).map((s) => parseArea(s.area)).filter((r): r is Rect => !!r);
  const isStatic = (x: number, y: number) => statics.some((r) => contains(r, x, y));
  // A text board has no cells of its own: its blanks, like its fields and lists, are bare.
  const board = resolveCell(layout.cell);
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
    // A whole-value flap covers the area instead of cells (see wholeValueFlaps).
    const cells = isWholeValue(field, spec) || isPlainImage(field, spec) ? null : spec;
    for (let y = rect.y1; y <= rect.y2; y++) for (let x = rect.x1; x <= rect.x2; x++) put(x, y, cells);
  }

  for (const list of layout.lists ?? []) {
    const rect = parseArea(list.area ?? "");
    if (!rect || !Array.isArray(list.columns) || list.columns.length === 0) continue;
    const spans = columnSpans(list.columns, rect);
    const headerColour = list.headerColor ?? DEFAULT_HEADER_COLOR;
    list.columns.forEach((column, i) => {
      const look = resolveCell(layout.cell, column?.cell);
      const whole = isWholeValue(column, look) || isPlainImage(column, look);
      for (let y = rect.y1; y <= rect.y2; y++) {
        const header = list.header && y === rect.y1;
        for (let x = spans[i].x1; x <= spans[i].x2; x++) {
          // A whole-value or image column keeps cells for its header only; its records are flaps or images.
          put(x, y, look && header ? { ...look, color: headerColour } : whole ? null : look);
        }
      }
    });
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
 *
 * Text is made plain first (see plainText), since character cells cannot show curly quotes or
 * accents.
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
    // Character cells show what their flaps or font have: see plainText.
    const text = plainText(values[field.id] ?? "").split("\n");
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
  const spans = columnSpans(list.columns, rect);
  // Each column's text, aligned within its own span; everything else in the row is a space.
  const line = (texts: string[]) => {
    const chars = Array<string>(width).fill(" ");
    spans.forEach((s, i) => {
      const w = s.x2 - s.x1 + 1;
      if (w <= 0) return;
      const text = alignLine(texts[i], w, list.columns[i].align ?? "left");
      for (let k = 0; k < w; k++) chars[s.x1 - rect.x1 + k] = text[k];
    });
    return chars.join("");
  };

  const lines: string[] = [];
  if (list.header) lines.push(line(list.columns.map((c) => c.title ?? "")));
  for (const record of pageOfRecords(list, rect, records, page)) {
    lines.push(record ? line(list.columns.map((c) => plainText(renderTemplate(String(c.text ?? ""), record)))) : " ".repeat(width));
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
    if ((field.cell?.type ?? layout.cell.type) !== "text" || field.image) continue;
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
      const block = (y: number, text: string, header?: string) =>
        blocks.push({
          key: `list:${list.id}:${j}:${y}`,
          rect: { x1: spans[j].x1, x2: spans[j].x2, y1: y, y2: y },
          text,
          align: column.align ?? "left",
          wrap: false,
          style: header ? { ...style, color: header, background: undefined } : style,
        });
      let y = rect.y1;
      // The header is a label above the column: in the header colour, on the board itself,
      // so the column's background starts with its first record and can never hide its title.
      if (list.header) block(y++, column.title ?? "", list.headerColor ?? DEFAULT_HEADER_COLOR);
      // An image column's records are images (see imageAreas): only its header is text.
      if (column.image) return;
      for (const record of rows) block(y++, record ? renderTemplate(String(column.text ?? ""), record) : "");
    });
  }

  return blocks;
}

/**
 * Whether an area shows its whole value on one flap: drawn as split-flap, and asked to (merged),
 * or showing images, which on a split-flap board are always whole flaps.
 */
export function isWholeValue(area: (WholeValue & ImageValue) | undefined, spec: CellSpec | null): boolean {
  return (area?.merged === true || area?.image === true) && spec?.type === "splitflap";
}

/** Whether an area shows images drawn plainly over its space: images, on anything but split-flap. */
export function isPlainImage(area: ImageValue | undefined, spec: CellSpec | null): boolean {
  return area?.image === true && spec?.type !== "splitflap";
}

/**
 * Each place a field or list column shows a value: a field's area, or one row of a list column
 * (its header row aside), with the value there now.
 */
interface ValueArea {
  key: string;
  rect: Rect;
  value: string;
  align: "left" | "right" | "center";
  area: WholeValue & ImageValue;
  spec: CellSpec | null;
  /** The area's template; every row of a list column shares it. */
  template: string;
  /** Shared by the rows of a list column. */
  group: string;
}

function valueAreas(layout: BoardLayout, values: Record<string, string>, records: Row[], page: number): ValueArea[] {
  const out: ValueArea[] = [];
  for (const field of layout.fields ?? []) {
    const rect = parseArea(field.area ?? "");
    if (!rect) continue;
    out.push({
      key: `field:${field.id}`,
      rect,
      value: values[field.id] ?? "",
      align: field.align ?? "left",
      area: field,
      spec: resolveCell(layout.cell, field.cell),
      template: typeof field.text === "string" ? field.text : "",
      group: `field:${field.id}`,
    });
  }
  for (const list of layout.lists ?? []) {
    const rect = parseArea(list.area ?? "");
    if (!rect || !Array.isArray(list.columns)) continue;
    const spans = columnSpans(list.columns, rect);
    const rows = pageOfRecords(list, rect, records, page);
    list.columns.forEach((column, j) => {
      if (!column || spans[j].x2 < spans[j].x1) return;
      const template = String(column.text ?? "");
      const spec = resolveCell(layout.cell, column.cell);
      rows.forEach((record, i) => {
        const y = rect.y1 + (list.header ? 1 : 0) + i;
        out.push({
          key: `list:${list.id}:${j}:${y}`,
          rect: { x1: spans[j].x1, x2: spans[j].x2, y1: y, y2: y },
          value: record ? renderTemplate(template, record) : "",
          align: column.align ?? "left",
          area: column,
          spec,
          template,
          group: `list:${list.id}:${j}`,
        });
      });
    });
  }
  return out;
}

/** One long split-flap showing a whole value or an image: a field, or one record of a list column. */
export interface WholeValueFlap {
  key: string;
  rect: Rect;
  /** The value to show: words, or an image's source (see imageSource); "" for the blank. */
  value: string;
  align: "left" | "right" | "center";
  spec: CellSpec;
  /** Faces are images rather than words. */
  image: boolean;
  fit: "contain" | "cover" | "fill";
  /** Which drum it shares: every row of a list column turns the same faces. A new template is a new drum. */
  drumKey: string;
  /** Faces given in the layout, in order (see WholeValue). Images have none. */
  drum: string[];
  /** Every value the area has across all the records, which the drum needs a face for. */
  values: string[];
}

/** The whole-value flaps on the board, with what each shows now. */
export function wholeValueFlaps(layout: BoardLayout, values: Record<string, string>, records: Row[] = [], page = 0): WholeValueFlap[] {
  const allValues = new Map<string, string[]>();
  const valuesOf = (template: string) => {
    if (!allValues.has(template)) allValues.set(template, [...new Set(records.map((r) => renderTemplate(template, r)))]);
    return allValues.get(template)!;
  };

  return valueAreas(layout, values, records, page).flatMap((a): WholeValueFlap[] => {
    if (!a.spec || !isWholeValue(a.area, a.spec)) return [];
    const image = a.area.image === true;
    // A field reads one record, but its drum still needs every value the template gives.
    const seen = [a.value, ...(a.template.includes("{") ? valuesOf(a.template) : [])];
    const asFace = (v: string) => (image ? (imageSource(v) ?? "") : v);
    return [
      {
        key: a.key,
        rect: a.rect,
        value: asFace(a.value),
        align: a.align,
        spec: a.spec,
        image,
        fit: a.area.fit ?? "contain",
        drumKey: `${a.group}|${image ? "image" : "text"}|${a.template}`,
        drum: !image && Array.isArray(a.area.drum) ? a.area.drum.filter((f) => typeof f === "string") : [],
        values: [...new Set(seen.map(asFace))],
      },
    ];
  });
}

/** An image drawn plainly over a field's area or a list row's column: images on anything but split-flap. */
export interface ImageArea {
  key: string;
  rect: Rect;
  /** What an <img> loads; null when the value is not an image, leaving the space bare. */
  src: string | null;
  fit: "contain" | "cover" | "fill";
}

export function imageAreas(layout: BoardLayout, values: Record<string, string>, records: Row[] = [], page = 0): ImageArea[] {
  return valueAreas(layout, values, records, page)
    .filter((a) => isPlainImage(a.area, a.spec))
    .map((a) => ({ key: a.key, rect: a.rect, src: imageSource(a.value), fit: a.area.fit ?? "contain" }));
}

/**
 * The faces on a whole-value drum, in the order they come round: a blank, the faces the layout
 * gives in its order, then the other values alphabetically. A value that matches a given face
 * apart from capitals does not get a face of its own: it shows that one (see faceFor). Images'
 * sources are compared exactly, capitals and all.
 */
export function drumFaces(given: string[], values: Iterable<string>, exact = false): string[] {
  const same = (f: string) => (exact ? f : f.toLowerCase());
  const faces = [""];
  const known = new Set<string>([""]);
  const add = (f: string) => {
    if (known.has(same(f))) return;
    faces.push(f);
    known.add(same(f));
  };
  given.forEach(add);
  [...new Set(values)].sort((a, b) => a.localeCompare(b)).forEach(add);
  return faces;
}

/** The face that shows a value: its own, or one that matches it apart from capitals; else the blank. */
export function faceFor(value: string, faces: string[], exact = false): number {
  const own = faces.indexOf(value);
  if (own >= 0 || exact) return Math.max(0, own);
  const lower = value.toLowerCase();
  return Math.max(0, faces.findIndex((f) => f.toLowerCase() === lower));
}

/**
 * A layout with its card lists turned into ordinary fields: one for each part of each card,
 * placed on the board, with the text it shows from that card's record (page `page` of the
 * records, as for lists: see pageOffset). A card with no record is blank. Everything that draws
 * fields then draws cards too, with nothing further to know about them.
 *
 * Also gives where each card is, for drawing outlines and for boards that change a card at a time.
 */
export function withCards(
  layout: BoardLayout,
  records: Row[] = [],
  page = 0
): { layout: BoardLayout; values: Record<string, string>; cards: Rect[] } {
  if (!layout.cards?.length) return { layout, values: {}, cards: [] };
  const fields: FieldArea[] = [];
  const values: Record<string, string> = {};
  const cards: Rect[] = [];
  for (const list of layout.cards) {
    const area = parseArea(list.area ?? "");
    if (!area || !Array.isArray(list.parts)) continue;
    const places = cardRects(list, area);
    const offset = pageOffset(records.length, places.length, page);
    places.forEach((card, i) => {
      cards.push(card);
      const record = records[offset + i];
      list.parts.forEach((part, j) => {
        const r = parseArea(part?.area ?? "");
        if (!r || card.x1 + r.x2 > card.x2 || card.y1 + r.y2 > card.y2) return;
        const id = `${list.id}#${i}.${part.id ?? j}`;
        const { row: _row, ...rest } = part as FieldArea;
        fields.push({ ...rest, id, area: `${card.x1 + r.x1},${card.y1 + r.y1} to ${card.x1 + r.x2},${card.y1 + r.y2}` });
        values[id] = record && typeof part.text === "string" ? renderTemplate(part.text, record) : "";
      });
    });
  }
  return { layout: { ...layout, fields: [...(layout.fields ?? []), ...fields] }, values, cards };
}

/**
 * Which group each position takes its turn in, as a number, lower first (see FlapClock's rows):
 * its row; its pair of rows; or the card it is in (by the card's top, then its left), with
 * positions in no card going by their row. Also what a clearing board clears together.
 */
export function turnGroups(turnBy: TurnBy, cards: Rect[]): (x: number, y: number) => number {
  if (turnBy === "pair") return (_x, y) => Math.floor(y / 2) * 2 * 1000;
  if (turnBy === "card") {
    return (x, y) => {
      const card = cards.find((c) => x >= c.x1 && x <= c.x2 && y >= c.y1 && y <= c.y2);
      return card ? card.y1 * 1000 + card.x1 : y * 1000;
    };
  }
  return (_x, y) => y * 1000;
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
  (layout.statics ?? []).forEach((s) => s.fontFamily && families.add(s.fontFamily));
  (layout.lists ?? []).forEach((l) => (Array.isArray(l.columns) ? l.columns : []).forEach((c) => add(c?.cell)));
  return [...families];
}


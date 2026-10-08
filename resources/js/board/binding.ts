/**
 * Turning a data source's rows into the text each field shows.
 *
 * A field binds to data with a text template and a row number:
 *
 *   { "id": "platform", "text": "PLATFORM {platform}", "row": 0 }
 *
 * "{column}" is replaced with that column's value in the given row; anything outside braces is
 * shown as it is. A format can follow a bar: "{departs_at|HH:mm}" shows 14:32. A missing row or
 * column, or a value that is empty, shows as nothing, so a board with fewer rows than it has
 * room for simply shows blanks.
 */

export type Row = Record<string, string | number | boolean | null>;

type Part = { literal: string } | { column: string; format?: string };

const PLACEHOLDER = /\{([^{}|]+)(?:\|([^{}]*))?\}/g;

export function parseTemplate(template: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    if (match.index > last) parts.push({ literal: template.slice(last, match.index) });
    const format = match[2]?.trim();
    parts.push({ column: match[1].trim(), ...(format ? { format } : {}) });
    last = match.index + match[0].length;
  }
  if (last < template.length) parts.push({ literal: template.slice(last) });
  return parts;
}

/** The columns a template uses, so the editor can warn about ones the data does not have. */
export function templateColumns(template: string): string[] {
  return parseTemplate(template).flatMap((p) => ("column" in p ? [p.column] : []));
}

export function renderTemplate(template: string, row: Row | undefined): string {
  return parseTemplate(template)
    .map((p) => ("literal" in p ? p.literal : formatValue(row?.[p.column] ?? null, p.format)))
    .join("");
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface WallTime {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * Read a date and/or time as the database wrote it, as wall-clock time. Deliberately no time
 * zone conversion: a departure stored as 14:32 is shown as 14:32, whatever zone the screen's
 * browser thinks it is in.
 */
export function parseWallTime(value: string): WallTime | null {
  const dateTime = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value);
  if (dateTime) {
    const [, y, mo, d, h = "0", mi = "0", s = "0"] = dateTime;
    return { year: +y, month: +mo, day: +d, hour: +h, minute: +mi, second: +s };
  }
  const time = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (time) {
    const [, h, mi, s = "0"] = time;
    return { year: 1970, month: 1, day: 1, hour: +h, minute: +mi, second: +s };
  }
  return null;
}

const TOKENS = /\[[^\]]*\]|YYYY|YY|MMMM|MMM|MM|M|dddd|ddd|DD|D|HH|H|hh|h|mm|ss|A|a/g;

/**
 * Format a date or time with tokens: YYYY YY, MMMM MMM MM M, DD D, dddd ddd, HH H (24-hour),
 * hh h (12-hour), mm, ss, A a (AM/PM). Text in [square brackets] is shown as it is.
 */
export function formatWallTime(t: WallTime, format: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const weekday = new Date(Date.UTC(t.year, t.month - 1, t.day)).getUTCDay();
  const hour12 = t.hour % 12 === 0 ? 12 : t.hour % 12;
  return format.replace(TOKENS, (token) => {
    switch (token) {
      case "YYYY": return String(t.year);
      case "YY": return pad(t.year % 100);
      case "MMMM": return MONTHS[t.month - 1];
      case "MMM": return MONTHS[t.month - 1].slice(0, 3);
      case "MM": return pad(t.month);
      case "M": return String(t.month);
      case "dddd": return DAYS[weekday];
      case "ddd": return DAYS[weekday].slice(0, 3);
      case "DD": return pad(t.day);
      case "D": return String(t.day);
      case "HH": return pad(t.hour);
      case "H": return String(t.hour);
      case "hh": return pad(hour12);
      case "h": return String(hour12);
      case "mm": return pad(t.minute);
      case "ss": return pad(t.second);
      case "A": return t.hour < 12 ? "AM" : "PM";
      case "a": return t.hour < 12 ? "am" : "pm";
      default: return token.slice(1, -1); // [literal]
    }
  });
}

/** A value as text, formatted when a format is given and the value is a date or time. */
export function formatValue(value: Row[string], format?: string): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!format) return text;
  const t = parseWallTime(text);
  return t ? formatWallTime(t, format) : text;
}

export interface BoundField {
  id: string;
  text?: string;
  row?: number;
}

/**
 * The text for every bound field, from the data source's rows. Fields with no template are left
 * out, so the caller can fill them some other way.
 */
export function bindFields(fields: BoundField[], rows: Row[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    if (typeof field.text !== "string") continue;
    values[field.id] = renderTemplate(field.text, rows[field.row ?? 0]);
  }
  return values;
}

/**
 * Values from the data that are images, for fields and list columns set to show them as images.
 *
 * Today two kinds are recognised:
 * - a data: URL of an image, which is how the server sends images kept in binary columns
 *   (BLOB, bytea, varbinary: see app/Data/BinaryValues.php);
 * - SVG markup, which is text, so a binary column holding SVG arrives as text.
 *
 * Images kept as base64 text, or as web addresses, can be added here later: each is another
 * pattern turned into a source an <img> can load.
 */

const DATA_URL = /^data:image\/(png|jpeg|gif|webp|svg\+xml)[;,]/i;
const SVG_START = /^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*|<!doctype[^>]*>\s*)*<svg[\s>]/i;

/**
 * Something an <img> can show for a value, or null if the value is not an image. An <img> never
 * runs scripts in an SVG or lets it load anything else, so SVG from the data is safe to show.
 */
export function imageSource(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (DATA_URL.test(v)) return v;
  if (SVG_START.test(v)) return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(v);
  return null;
}

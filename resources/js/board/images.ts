/**
 * Values from the data that are images, for fields and list columns set to show them as images.
 *
 * Three kinds are recognised:
 * - a data: URL of an image, which is how the server sends images kept in binary columns
 *   (BLOB, bytea, varbinary: see app/Data/BinaryValues.php);
 * - SVG markup, which is text, so a binary column holding SVG arrives as text;
 * - a web address (http or https), as news feeds give for their stories' pictures. The screen
 *   loads it from that site (asking without saying which page wants it: see IMAGE_REFERRER).
 *
 * Images kept as base64 text could be added here too: another pattern turned into a source an
 * <img> can load.
 */

/** How images from web addresses are asked for: without telling the site which page wants them. */
export const IMAGE_REFERRER = "no-referrer";

const DATA_URL = /^data:image\/(png|jpeg|gif|webp|svg\+xml)[;,]/i;
const SVG_START = /^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*|<!doctype[^>]*>\s*)*<svg[\s>]/i;
const WEB_ADDRESS = /^https?:\/\/[^\s"'<>]+$/i;

/**
 * Something an <img> can show for a value, or null if the value is not an image. An <img> never
 * runs scripts in an SVG or lets it load anything else, so SVG from the data is safe to show.
 *
 * @param webAddresses whether a web address counts: yes for an area set to show images, where
 *   any address is meant to be a picture; not where an address is as likely a link to a page
 */
export function imageSource(value: unknown, webAddresses = true): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (DATA_URL.test(v)) return v;
  if (SVG_START.test(v)) return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(v);
  if (webAddresses && WEB_ADDRESS.test(v)) return v;
  return null;
}

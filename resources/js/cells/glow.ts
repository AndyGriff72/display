/**
 * The glow round lit dots and segments, and the wire mesh over VFD glass, as SVG filters and
 * patterns defined once for the whole page. (A CSS drop-shadow on part of an SVG is not
 * reliable across browsers.) Sizes are in each cell's own drawing units, which differ by cell
 * type, hence one of each per cell type and finish.
 *
 * Each filter covers a fixed region of the cell's drawing rather than the default, which is
 * sized from the lit shapes themselves: a "1" lit only on vertical segments has no width,
 * and a filter region with no width draws nothing at all.
 */
export const GLOW_DOT = "lit-glow-dot";
export const GLOW_SEGMENT = "lit-glow-segment";
/** VFD phosphor blooms further than an LED. */
export const GLOW_DOT_VFD = "lit-glow-dot-vfd";
export const GLOW_SEGMENT_VFD = "lit-glow-segment-vfd";
/** A lit bulb throws a big, warm halo. */
export const GLOW_BULB = "lit-glow-bulb";

/** The fine wire grid in front of a VFD's phosphor, for dot-matrix and segment cells. */
export const MESH_DOT = "lit-mesh-dot";
export const MESH_SEGMENT = "lit-mesh-segment";

type Region = [x: number, y: number, w: number, h: number];

/** Glows: [id, blur, region, how many times the blur is laid under the shape (more is brighter)]. */
const FILTERS: [id: string, blur: number, region: Region, layers: number][] = [
  [GLOW_DOT, 0.22, [-1, -1, 7, 9], 1],
  [GLOW_SEGMENT, 2.6, [-20, -15, 110, 130], 1],
  [GLOW_DOT_VFD, 0.38, [-1, -1, 7, 9], 2],
  [GLOW_SEGMENT_VFD, 4.5, [-20, -15, 110, 130], 2],
  [GLOW_BULB, 0.5, [-1.5, -1.5, 8, 10], 2],
];

/** Meshes: [id, pitch, line width], in the cell's drawing units. */
const MESHES: [id: string, pitch: number, line: number][] = [
  [MESH_DOT, 0.25, 0.035],
  [MESH_SEGMENT, 3.4, 0.45],
];

/** Changed whenever the definitions below change, so a page holding older ones replaces them. */
const VERSION = "2";

const CONTAINER_ID = "lit-glow-filters";
const MARKUP =
  "<defs>" +
  FILTERS.map(
    ([id, blur, [x, y, w, h], layers]) =>
      `<filter id="${id}" filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}">` +
      `<feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="blur"/>` +
      `<feMerge>${'<feMergeNode in="blur"/>'.repeat(layers)}<feMergeNode in="SourceGraphic"/></feMerge>` +
      `</filter>`
  ).join("") +
  MESHES.map(
    ([id, pitch, line]) =>
      `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${pitch}" height="${pitch}">` +
      `<path d="M0 0H${pitch}M0 0V${pitch}" stroke="#000" stroke-width="${line}" fill="none"/>` +
      `</pattern>`
  ).join("") +
  "</defs>";

/**
 * Add the definitions to the page, or bring them up to date. The page is checked rather than a
 * module flag, because a hot reload during development runs this module afresh while the old
 * definitions are still in the page; adding a second copy would leave the browser using the
 * first, out-of-date one, since it resolves a repeated id to the first match.
 *
 * Checked by version rather than by comparing the markup: the browser writes SVG back out
 * differently from how it was given (self-closing tags, for one), so a comparison would never
 * match and the definitions would be rebuilt on every cell's every render.
 */
export function ensureGlowFilters(): void {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(CONTAINER_ID);
  if (existing) {
    if (existing.dataset.version !== VERSION) {
      existing.innerHTML = MARKUP;
      existing.dataset.version = VERSION;
    }
    return;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = CONTAINER_ID;
  svg.dataset.version = VERSION;
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  svg.innerHTML = MARKUP;
  document.body.appendChild(svg);
}

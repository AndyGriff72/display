/**
 * The glow round lit dots and segments, as SVG filters defined once for the whole page.
 * (A CSS drop-shadow on part of an SVG is not reliable across browsers.) There are two
 * because blur is measured in each cell's own drawing units, which differ by cell type.
 *
 * Each filter covers a fixed region of the cell's drawing rather than the default, which is
 * sized from the lit shapes themselves: a "1" lit only on vertical segments has no width,
 * and a filter region with no width draws nothing at all.
 */
export const GLOW_DOT = "lit-glow-dot";
export const GLOW_SEGMENT = "lit-glow-segment";

const FILTERS: [id: string, blur: number, region: [x: number, y: number, w: number, h: number]][] = [
  [GLOW_DOT, 0.22, [-1, -1, 7, 9]],
  [GLOW_SEGMENT, 2.6, [-20, -15, 110, 130]],
];

const CONTAINER_ID = "lit-glow-filters";
const MARKUP =
  "<defs>" +
  FILTERS.map(
    ([id, blur, [x, y, w, h]]) =>
      `<filter id="${id}" filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}">` +
      `<feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="blur"/>` +
      `<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>` +
      `</filter>`
  ).join("") +
  "</defs>";

/**
 * Add the filters to the page, or bring them up to date. The page is checked rather than a
 * module flag, because a hot reload during development runs this module afresh while the
 * old filters are still in the page; adding a second copy would leave the browser using
 * the first, out-of-date one, since it resolves a repeated id to the first match.
 */
export function ensureGlowFilters(): void {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(CONTAINER_ID);
  if (existing) {
    if (existing.innerHTML !== MARKUP) existing.innerHTML = MARKUP;
    return;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = CONTAINER_ID;
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  svg.innerHTML = MARKUP;
  document.body.appendChild(svg);
}

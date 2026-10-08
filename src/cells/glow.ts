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

let added = false;

export function ensureGlowFilters(): void {
  if (added || typeof document === "undefined") return;
  added = true;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  svg.innerHTML =
    "<defs>" +
    FILTERS.map(
      ([id, blur, [x, y, w, h]]) =>
        `<filter id="${id}" filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}">` +
        `<feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="blur"/>` +
        `<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>` +
        `</filter>`
    ).join("") +
    "</defs>";
  document.body.appendChild(svg);
}

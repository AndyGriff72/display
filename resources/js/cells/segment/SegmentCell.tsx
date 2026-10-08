import { memo, type CSSProperties } from "react";
import type { CellProps } from "../types";
import { DOTS, SEGMENT_LINES, SEGMENT_WIDTH, litSegments, type SegmentCount } from "./segments";
import { GLOW_SEGMENT, ensureGlowFilters } from "../glow";
import "../lit.css";

export interface SegmentCellProps extends CellProps {
  /** 7 for digits (clocks, platform numbers); 14 for text. */
  segments?: SegmentCount;
}

/**
 * One segmented LED character with a slight forward slant, as on most real displays.
 * Unlit segments and the decimal point stay faintly visible; the colon dots only appear
 * when lit, so they do not clutter every cell.
 */
export const SegmentCell = memo(function SegmentCell({
  char,
  width,
  height,
  color,
  segments = 14,
  className,
  style,
}: SegmentCellProps) {
  ensureGlowFilters();
  const on = litSegments(char, segments);
  const lines = Object.entries(SEGMENT_LINES[segments]);
  const line = ([name, [x1, y1, x2, y2]]: (typeof lines)[number]) => (
    <line key={name} x1={x1} y1={y1} x2={x2} y2={y2} />
  );
  const dot = (name: keyof typeof DOTS) => {
    const [cx, cy, r] = DOTS[name];
    return <circle key={name} cx={cx} cy={cy} r={r} />;
  };
  const colon = (["colonTop", "colonBottom"] as const).filter((d) => on.has(d));

  return (
    <svg
      className={`lit-cell${className ? ` ${className}` : ""}`}
      style={{ width, height, ...(color ? { color } : {}), ...style } as CSSProperties}
      viewBox="0 0 66 100"
      aria-label={char}
    >
      <g transform="translate(6 0) skewX(-6)" strokeWidth={SEGMENT_WIDTH[segments]} strokeLinecap="round">
        <g className="lit-off">
          {lines.filter(([name]) => !on.has(name)).map(line)}
          {!on.has("dp") && dot("dp")}
        </g>
        <g className="lit-on" filter={`url(#${GLOW_SEGMENT})`}>
          {lines.filter(([name]) => on.has(name)).map(line)}
          {on.has("dp") && dot("dp")}
          {colon.map(dot)}
        </g>
      </g>
    </svg>
  );
});

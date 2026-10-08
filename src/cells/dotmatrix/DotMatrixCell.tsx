import { memo, type CSSProperties } from "react";
import type { CellProps } from "../types";
import { DOT_COLUMNS, DOT_ROWS, dotGlyph } from "./font5x7";
import { GLOW_DOT, ensureGlowFilters } from "../glow";
import "../lit.css";

/**
 * One dot-matrix character: a 5 × 7 grid of LEDs. Unlit dots stay faintly visible, as on a
 * real board. It changes instantly; LEDs do not animate.
 */
export const DotMatrixCell = memo(function DotMatrixCell({ char, width, height, color, className, style }: CellProps) {
  ensureGlowFilters();
  const rows = dotGlyph(char);
  const lit: [number, number][] = [];
  const unlit: [number, number][] = [];
  rows.forEach((row, y) => [...row].forEach((d, x) => (d === "#" ? lit : unlit).push([x, y])));

  return (
    <svg
      className={`lit-cell${className ? ` ${className}` : ""}`}
      style={{ width, height, ...(color ? { color } : {}), ...style } as CSSProperties}
      viewBox={`-0.15 -0.15 ${DOT_COLUMNS + 0.3} ${DOT_ROWS + 0.3}`}
      aria-label={char}
    >
      <g className="lit-off">
        {unlit.map(([x, y]) => (
          <circle key={`${x},${y}`} cx={x + 0.5} cy={y + 0.5} r={0.4} />
        ))}
      </g>
      <g className="lit-on" filter={`url(#${GLOW_DOT})`}>
        {lit.map(([x, y]) => (
          <circle key={`${x},${y}`} cx={x + 0.5} cy={y + 0.5} r={0.4} />
        ))}
      </g>
    </svg>
  );
});

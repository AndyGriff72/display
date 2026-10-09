import { memo, type CSSProperties } from "react";
import type { CellProps, Finish } from "../types";
import { DOT_COLUMNS, DOT_ROWS, dotGlyph } from "./font5x7";
import { GLOW_BULB, GLOW_DOT, GLOW_DOT_VFD, MESH_DOT, ensureGlowFilters } from "../glow";
import "../lit.css";

export interface DotMatrixCellProps extends CellProps {
  /** LED (the default), VFD or lightbulbs. */
  finish?: Finish;
}

const GLOW: Record<Finish, string> = { led: GLOW_DOT, vfd: GLOW_DOT_VFD, bulb: GLOW_BULB };

/**
 * One dot-matrix character: a 5 × 7 grid of lights. Unlit lights stay faintly visible, as on a
 * real board.
 *
 * Every dot is drawn twice, in fixed places: once unlit, and once as its light, which is turned
 * up or down. LEDs and VFDs switch at once; bulbs warm up and fade, as filaments do.
 */
export const DotMatrixCell = memo(function DotMatrixCell({
  char,
  width,
  height,
  color,
  finish = "led",
  className,
  style,
}: DotMatrixCellProps) {
  ensureGlowFilters();
  const lit = dotGlyph(char).flatMap((row) => [...row].map((d) => d === "#"));
  const positions = lit.map((_, i) => [i % DOT_COLUMNS, Math.floor(i / DOT_COLUMNS)] as const);

  // VFD dot matrices have near-square dots; LEDs and bulbs are round.
  const shape = (x: number, y: number, key: string) =>
    finish === "vfd" ? (
      <rect key={key} x={x + 0.12} y={y + 0.12} width={0.76} height={0.76} rx={0.14} />
    ) : (
      <circle key={key} cx={x + 0.5} cy={y + 0.5} r={finish === "bulb" ? 0.43 : 0.4} />
    );

  return (
    <svg
      className={`lit-cell finish-${finish}${className ? ` ${className}` : ""}`}
      style={{ width, height, ...(color ? { color } : {}), ...style } as CSSProperties}
      viewBox={`-0.15 -0.15 ${DOT_COLUMNS + 0.3} ${DOT_ROWS + 0.3}`}
      aria-label={char}
    >
      <g className="lit-off">{positions.map(([x, y], i) => shape(x, y, `off${i}`))}</g>
      <g className="lit-on" filter={`url(#${GLOW[finish]})`}>
        {positions.map(([x, y], i) => (
          <g key={i} className={lit[i] ? "lit-dot is-lit" : "lit-dot"}>
            {shape(x, y, "light")}
            {/* A bulb's filament: a hot, near-white centre. */}
            {finish === "bulb" && <circle className="filament" cx={x + 0.5} cy={y + 0.5} r={0.17} />}
          </g>
        ))}
      </g>
      {finish === "vfd" && <rect className="vfd-mesh" x={-0.15} y={-0.15} width={DOT_COLUMNS + 0.3} height={DOT_ROWS + 0.3} fill={`url(#${MESH_DOT})`} />}
    </svg>
  );
});

import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { DOT_COLUMNS, DOT_ROWS, dotGlyph } from "../dotmatrix/font5x7";
import type { CellProps } from "../types";
import "./FlipDotCell.css";

/** How long one disc takes to turn over, in milliseconds. */
export const FLIP_MS = 140;

/** The delay between one column of discs and the next, as the sign's controller sweeps across. */
export const SWEEP_STEP_MS = 7;

export interface FlipDotCellProps extends CellProps {
  /** The colour of the discs' dark side. Defaults to a near-black just lighter than the board. */
  background?: string;
  /** Which column of the board this cell is in, so the sweep runs across the whole board. */
  sweepIndex?: number;
  /** Called when discs start to turn, with the delay in milliseconds of each column that turns. */
  onFlip?: (delaysMs: number[]) => void;
}

const DOTS = DOT_COLUMNS * DOT_ROWS;

function litDots(char: string): boolean[] {
  return dotGlyph(char).flatMap((row) => [...row].map((d) => d === "#"));
}

/**
 * One flip-dot character: a 5 × 7 grid of discs, bright on one side and dark on the other. When
 * the character changes, only the discs that differ turn over, sweeping across from left to
 * right as a real sign's controller works through its columns. It starts with every disc dark
 * and turns up to its first character, as a sign does when switched on.
 */
export const FlipDotCell = memo(function FlipDotCell({
  char,
  width,
  height,
  color = "#ffd21f",
  background = "#1c1c1c",
  sweepIndex = 0,
  onFlip,
  className,
  style,
}: FlipDotCellProps) {
  const target = useMemo(() => litDots(char), [char]);
  // What the discs show, which of them turned last time, and a count that restarts their animation.
  const [shown, setShown] = useState(() => ({ lit: Array<boolean>(DOTS).fill(false), turned: Array<boolean>(DOTS).fill(false), turn: 0 }));
  const onFlipRef = useRef(onFlip);
  onFlipRef.current = onFlip;

  useLayoutEffect(() => {
    const turned = target.map((on, i) => on !== shown.lit[i]);
    if (!turned.some(Boolean)) return;
    setShown((s) => ({ lit: target, turned, turn: s.turn + 1 }));
    const columns = new Set<number>();
    turned.forEach((t, i) => t && columns.add(i % DOT_COLUMNS));
    onFlipRef.current?.([...columns].map((c) => (sweepIndex * DOT_COLUMNS + c) * SWEEP_STEP_MS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // The discs sit on an even pitch, centred in the cell.
  const pitch = Math.min(width / DOT_COLUMNS, height / DOT_ROWS);
  const vars = {
    width,
    height,
    "--fd-pitch": `${pitch}px`,
    "--fd-dot": `${pitch * 0.86}px`,
    "--fd-on": color,
    "--fd-off": background,
    "--fd-ms": `${FLIP_MS}ms`,
    ...style,
  } as CSSProperties;

  return (
    <div className={`fd-cell${className ? ` ${className}` : ""}`} style={vars} aria-label={char}>
      {shown.lit.map((on, i) => {
        const turning = shown.turned[i];
        const column = i % DOT_COLUMNS;
        return (
          <span
            // A new key each turn restarts the disc's animation.
            key={turning ? `${i}-${shown.turn}` : i}
            className={`fd-dot${on ? " fd-on" : ""}${turning ? " fd-turn" : ""}`}
            style={turning ? ({ "--fd-delay": `${(sweepIndex * DOT_COLUMNS + column) * SWEEP_STEP_MS}ms` } as CSSProperties) : undefined}
          />
        );
      })}
    </div>
  );
});

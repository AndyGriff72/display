import { memo, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import { dotGlyph } from "../dotmatrix/font5x7";
import type { MotionTracker } from "../splitflap/flapClock";
import type { CellProps } from "../types";
import { FlipDotPainter } from "./flipDotPainter";
import "./FlipDotCell.css";

export { FLIP_MS, SWEEP_STEP_MS } from "./flipDotPainter";

export interface FlipDotCellProps extends CellProps {
  /** The colour of the discs' dark side. Defaults to a near-black just lighter than the board. */
  background?: string;
  /** Which column of the board this cell is in, so the sweep runs across the whole board. */
  sweepIndex?: number;
  /** Called when discs start to turn, with the delay in milliseconds of each column that turns. */
  onFlip?: (delaysMs: number[]) => void;
  /** Told when the cell starts and stops turning, so the board knows when it is still. */
  tracker?: MotionTracker;
  /** Discs turn sweeping across the board (the default), or all at once (less motion). */
  sweep?: boolean;
}

function litDots(char: string): boolean[] {
  return dotGlyph(char).flatMap((row) => [...row].map((d) => d === "#"));
}

/**
 * One flip-dot character: a 5 × 7 grid of discs, bright on one side and dark on the other. When
 * the character changes, only the discs that differ turn over, sweeping across from left to
 * right as a real sign's controller works through its columns. It starts with every disc dark
 * and turns up to its first character, as a sign does when switched on.
 *
 * Drawn on a canvas, not as 35 elements (see FlipDotPainter): React draws the cell once, and
 * the painter does the rest.
 */
export const FlipDotCell = memo(function FlipDotCell({
  char,
  width,
  height,
  color = "#ffd21f",
  background = "#1c1c1c",
  sweepIndex = 0,
  onFlip,
  tracker,
  sweep = true,
  className,
  style,
}: FlipDotCellProps) {
  const target = useMemo(() => litDots(char), [char]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const painter = useRef<FlipDotPainter | null>(null);
  const trackerRef = useRef(tracker);
  trackerRef.current = tracker;
  const onFlipRef = useRef(onFlip);
  onFlipRef.current = onFlip;
  const look = { width, height, color, background, sweepIndex };

  // The painter is made once, with the cell.
  useLayoutEffect(() => {
    const me = {};
    const p = new FlipDotPainter(canvas.current!, look, (moving) => trackerRef.current?.set(me, moving));
    painter.current = p;
    return () => {
      p.dispose();
      painter.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    painter.current?.setLook(look);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, color, background, sweepIndex]);

  useLayoutEffect(() => {
    const delays = painter.current?.show(target, sweep) ?? [];
    if (delays.length) onFlipRef.current?.(delays);
  }, [target]);

  return (
    <div className={`fd-cell${className ? ` ${className}` : ""}`} style={{ width, height, ...style } as CSSProperties} aria-label={char}>
      <canvas ref={canvas} className="fd-canvas" style={{ width, height }} aria-hidden />
    </div>
  );
});

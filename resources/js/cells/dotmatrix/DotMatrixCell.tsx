import { memo, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { CellProps, Finish } from "../types";
import { DotMatrixPainter, dotMatrixGeometry } from "./dotMatrixPainter";
import "../lit.css";

export interface DotMatrixCellProps extends CellProps {
  /** LED (the default), VFD or lightbulbs. */
  finish?: Finish;
  /** Lightbulbs fade from one character to the next (the default), or switch at once (less motion). */
  fade?: boolean;
}

/** As lit.css's default colour, for a cell given none. */
const DEFAULT_COLOUR = "#ffb000";

/**
 * One dot-matrix character: a 5 × 7 grid of lights. Unlit lights stay faintly visible, as on a
 * real board. LEDs and VFDs switch at once; bulbs warm up and fade, as filaments do.
 *
 * Drawn on a canvas (see DotMatrixPainter): React draws the cell once, and the painter draws
 * each character, the glow reaching a little past the cell as light does.
 */
export const DotMatrixCell = memo(function DotMatrixCell({
  char,
  width,
  height,
  color = DEFAULT_COLOUR,
  finish = "led",
  fade = true,
  className,
  style,
}: DotMatrixCellProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const back = useRef<HTMLCanvasElement>(null);
  const painter = useRef<DotMatrixPainter | null>(null);
  const look = { width, height, color, finish };

  useLayoutEffect(() => {
    const p = new DotMatrixPainter([canvas.current!, back.current!], look);
    painter.current = p;
    return () => {
      p.dispose();
      painter.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    painter.current?.show(char, look, fade);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char, width, height, color, finish]);

  // The canvas reaches past the cell by the glow's room, all round (see DotMatrixPainter).
  const g = dotMatrixGeometry(width, height);
  return (
    <div
      className={`lit-cell lit-canvas-cell finish-${finish}${className ? ` ${className}` : ""}`}
      style={{ width, height, color, ...style } as CSSProperties}
      aria-label={char}
    >
      {/* Two canvases: lightbulbs crossfade from one character to the next (see DotMatrixPainter). */}
      <canvas ref={canvas} className="lit-canvas" style={{ left: -g.bleed, top: -g.bleed, width: g.width, height: g.height }} aria-hidden />
      <canvas ref={back} className="lit-canvas" style={{ left: -g.bleed, top: -g.bleed, width: g.width, height: g.height, opacity: 0 }} aria-hidden />
    </div>
  );
});

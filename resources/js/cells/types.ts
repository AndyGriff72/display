import type { CSSProperties } from "react";

/**
 * What every kind of character cell takes. Split-flap is the first; segmented LED and dot
 * matrix will take the same props so a board can swap cell types without changing how it
 * lays out the grid or feeds it text.
 */
export interface CellProps {
  /** The character the cell should end up showing. */
  char: string;
  /** Cell size in pixels. */
  width: number;
  height: number;
  /** Glyph size in pixels. Defaults to a proportion of the height that suits the cell type. */
  fontSize?: number;
  /** CSS font-family for the glyph. Only cells that draw with a font use it. */
  fontFamily?: string;
  /** Colour of the characters: the print on a flap, or a lit LED. Any CSS colour. */
  color?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * How lit cells (dot matrix, segments) are drawn: "led", the default; "vfd", a vacuum
 * fluorescent display's blue-green phosphor behind a fine wire mesh; or "bulb", a grid of
 * lightbulbs that warm up and fade (dot matrix only).
 */
export type Finish = "led" | "vfd" | "bulb";

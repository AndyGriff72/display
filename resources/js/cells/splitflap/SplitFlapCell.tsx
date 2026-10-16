import { memo, useCallback, type CSSProperties } from "react";
import { CHARSETS } from "../charsets";
import type { CellProps } from "../types";
import type { FlapClock } from "./flapClock";
import { flapIndex, nextFlap, normalizeStack } from "./flapStack";
import { useFlapMotion } from "./useFlapMotion";
import "./SplitFlapCell.css";

export interface SplitFlapCellProps extends CellProps {
  /** The flaps on the drum, in the order they come round. Defaults to the standard stack. */
  stack?: string;
  /** How long one flap takes to fall, in milliseconds. */
  flipMs?: number;
  /** The board's beat, which every flap falls on (see FlapClock). Without one, the cell keeps its own time. */
  clock?: FlapClock;
  /** Without a clock: called each time a flap lands, e.g. to play the click. */
  onFlap?: () => void;
  /** The flaps' colour, instead of the usual near-black. Any CSS colour. */
  background?: string;
}

/**
 * One split-flap character. It never jumps to a character: it flips forward through every
 * flap in its stack, one at a time, until it reaches the one it was asked for.
 */
export const SplitFlapCell = memo(function SplitFlapCell({
  char,
  width,
  height,
  fontSize,
  fontFamily,
  color,
  stack: givenStack = CHARSETS.standard,
  flipMs = 80,
  clock,
  onFlap,
  background,
  className,
  style,
}: SplitFlapCellProps) {
  const stack = normalizeStack(givenStack);
  const target = stack[flapIndex(char, stack)];
  const nextOf = useCallback((c: string) => stack[nextFlap(Math.max(0, stack.indexOf(c)), stack)], [stack]);
  const { shown: current, next, flipping } = useFlapMotion(stack[0], target, nextOf, flipMs, clock, onFlap);

  const vars = {
    "--sf-w": `${width}px`,
    "--sf-h": `${height}px`,
    "--sf-font-size": `${fontSize ?? Math.round(height * 0.78)}px`,
    "--sf-flip": `${flipMs}ms`,
    ...(fontFamily ? { "--sf-font": fontFamily } : {}),
    ...(color ? { "--sf-fg": color } : {}),
    ...(background ? flapShades(background) : {}),
    ...style,
  } as CSSProperties;

  return (
    <div className={`sf-cell${className ? ` ${className}` : ""}`} style={vars} aria-label={target}>
      {/* What is revealed behind the flaps: the next character's top, the old one's bottom. */}
      <Half pos="top" glyph={next} />
      <Half pos="bottom" glyph={current} />
      {flipping && (
        // Keyed by position so each flip remounts the flaps and restarts their animation.
        <span key={current} className="sf-flaps">
          <Half pos="top" glyph={current} flap />
          <Half pos="bottom" glyph={next} flap />
        </span>
      )}
    </div>
  );
});

function Half({ pos, glyph, flap }: { pos: "top" | "bottom"; glyph: string; flap?: boolean }) {
  return (
    <span className={`sf-half sf-${pos}${flap ? " sf-flap" : ""}`} aria-hidden>
      <span className="sf-glyph">{glyph}</span>
    </span>
  );
}

/**
 * A flap colour and the darker shades the flap's styles use with it, in the same proportions
 * as the default near-black ones (--sf-bg-a and --sf-bg-b about 88% and 70% of --sf-bg).
 */
export function flapShades(colour: string): Record<string, string> {
  const shade = (percent: number) => `color-mix(in srgb, ${colour} ${percent}%, #000)`;
  return { "--sf-bg": colour, "--sf-bg-a": shade(88), "--sf-bg-b": shade(70), "--sf-bg-edge": shade(58) };
}

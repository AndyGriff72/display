import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { CHARSETS } from "../charsets";
import type { CellProps } from "../types";
import { flapIndex, nextFlap } from "./flapStack";
import "./SplitFlapCell.css";

export interface SplitFlapCellProps extends CellProps {
  /** The flaps on the drum, in the order they come round. Defaults to the standard stack. */
  stack?: string;
  /** How long one flap takes to fall, in milliseconds. */
  flipMs?: number;
  /** Called each time a flap lands, e.g. to play the click. */
  onFlap?: () => void;
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
  stack = CHARSETS.standard,
  flipMs = 80,
  onFlap,
  className,
  style,
}: SplitFlapCellProps) {
  const target = flapIndex(char, stack);
  // Starts on the blank, as a board does when it is switched on.
  const [shown, setShown] = useState(0);
  const [flipping, setFlipping] = useState(false);

  // Read the latest callback when a flap lands without restarting the flip timer every render.
  const onFlapRef = useRef(onFlap);
  onFlapRef.current = onFlap;

  // Start the next flap. A layout effect, so the cell never paints a frame standing still
  // between two flips of the same run.
  useLayoutEffect(() => {
    if (flipping || shown === target) return;
    // A hidden tab throttles timers to about once a second, which would leave the board
    // crawling through its stack long after the tab is back. Nobody is watching, so settle.
    if (document.hidden) {
      setShown(target);
      return;
    }
    setFlipping(true);
  }, [flipping, shown, target]);

  // Land the flap once it has fallen. A flap already falling always finishes, even if the
  // target changes under it, just as the mechanism would.
  useEffect(() => {
    if (!flipping) return;
    const timer = window.setTimeout(() => {
      setShown((s) => nextFlap(s, stack));
      setFlipping(false);
      onFlapRef.current?.();
    }, flipMs);
    return () => window.clearTimeout(timer);
  }, [flipping, flipMs, stack]);

  const current = stack[shown] ?? " ";
  const next = flipping ? stack[nextFlap(shown, stack)] : current;

  const vars = {
    "--sf-w": `${width}px`,
    "--sf-h": `${height}px`,
    "--sf-font-size": `${fontSize ?? Math.round(height * 0.78)}px`,
    "--sf-flip": `${flipMs}ms`,
    ...(fontFamily ? { "--sf-font": fontFamily } : {}),
    ...style,
  } as CSSProperties;

  return (
    <div className={`sf-cell${className ? ` ${className}` : ""}`} style={vars} aria-label={stack[target]}>
      {/* What is revealed behind the flaps: the next character's top, the old one's bottom. */}
      <Half pos="top" glyph={next} />
      <Half pos="bottom" glyph={current} />
      {flipping && (
        // Keyed by position so each flip remounts the flaps and restarts their animation.
        <span key={shown} className="sf-flaps">
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

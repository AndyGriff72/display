import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { DotMatrixCell } from "./dotmatrix/DotMatrixCell";
import { SegmentCell } from "./segment/SegmentCell";
import type { MotionTracker } from "./splitflap/flapClock";
import type { Finish } from "./types";

/**
 * Lit displays (dot matrix and segments) printing their characters one at a time, with a cursor
 * just ahead of the last one printed, as a terminal does: a solid block on a dot matrix, a dash
 * on segments.
 *
 * When anything in a board row changes, the row clears and prints again from the left. A row
 * prints up to its last character that is not blank, the cursor showing one step past it and
 * then going, so a short line does not spend time printing its trailing spaces.
 */

/** The cursor: a solid block on a dot matrix, a dash on segments. */
export const PRINT_CURSOR = { dotmatrix: "█", segment: "-" } as const;

/** How long each character takes to print, unless the board says otherwise, in milliseconds. */
export const DEFAULT_PRINT_MS = 20;

/** When one cell prints: its row's contents (a new value starts it again) and its moment. */
export interface PrintStep {
  /** Changes whenever the cell's row changes, starting its printing again. */
  key: string;
  /** When the cursor reaches it, in milliseconds from the change. */
  at: number;
}

/**
 * When each printing cell prints, keyed "x,y". Cells are printed left to right along their row,
 * up to one past the row's last character that is not blank; cells past that are left out (they
 * just show their character). With `inTurn`, a row that changes waits for the changing rows above
 * it to finish; otherwise all print at once.
 *
 * @param rows each row's printing cells, left to right: position key and character
 * @param changed which rows have just changed (only they wait for each other, in turn)
 */
export function printPlan(
  rows: Map<number, { key: string; char: string }[]>,
  rowKeys: Map<number, string>,
  changed: Set<number>,
  printMs: number,
  inTurn: boolean
): Map<string, PrintStep> {
  const plan = new Map<string, PrintStep>();
  let offset = 0;
  for (const y of [...rows.keys()].sort((a, b) => a - b)) {
    const cells = rows.get(y)!;
    let last = -1;
    cells.forEach((c, i) => {
      if (c.char !== " ") last = i;
    });
    const length = Math.min(cells.length, last + 2);
    const start = inTurn && changed.has(y) ? offset : 0;
    for (let i = 0; i < length; i++) plan.set(cells[i].key, { key: rowKeys.get(y) ?? "", at: start + i * printMs });
    if (inTurn && changed.has(y)) offset += length * printMs;
  }
  return plan;
}

/**
 * A lit cell that prints: blank as its row starts again, the cursor when its turn comes, and its
 * character one step later. Without a step, it shows its character as usual. Its props are all
 * plain values, so it only draws again when something about it changes.
 */
export const PrintedCell = memo(function PrintedCell({
  kind,
  char,
  width,
  height,
  color,
  finish,
  segments,
  style,
  step,
  printMs,
  tracker,
}: {
  kind: "dotmatrix" | "segment";
  char: string;
  width: number;
  height: number;
  color?: string;
  finish?: Finish;
  segments?: 7 | 14;
  style?: CSSProperties;
  step: PrintStep | undefined;
  printMs: number;
  tracker?: MotionTracker;
}) {
  const shown = usePrinted(char, step, printMs, PRINT_CURSOR[kind], tracker);
  return kind === "dotmatrix" ? (
    <DotMatrixCell char={shown} width={width} height={height} color={color} finish={finish} style={style} />
  ) : (
    <SegmentCell char={shown} width={width} height={height} color={color} finish={finish} segments={segments} style={style} />
  );
});

function usePrinted(target: string, step: PrintStep | undefined, printMs: number, cursor: string, tracker?: MotionTracker): string {
  const [shown, setShown] = useState(step ? " " : target);
  const me = useRef({}).current;
  const latest = useRef({ target, step, printMs, cursor });
  latest.current = { target, step, printMs, cursor };

  useEffect(() => {
    const { step: s, printMs: ms, cursor: c } = latest.current;
    if (!s) {
      setShown(latest.current.target);
      return;
    }
    tracker?.set(me, true);
    setShown(" ");
    const timers = [
      window.setTimeout(() => setShown(c), s.at),
      window.setTimeout(() => {
        setShown(latest.current.target);
        tracker?.set(me, false);
      }, s.at + ms),
    ];
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      tracker?.set(me, false);
    };
    // Starts again only when the row changes (its key), not on every redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.key, step === undefined]);

  // A cell not printing follows its character at once.
  useEffect(() => {
    if (!step) setShown(target);
  }, [step, target]);

  return shown;
}

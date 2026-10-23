import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Drum, type FlapMover } from "./drum";
import type { FlapClock, MotionTracker } from "./flapClock";

export interface FlapMotion {
  /** The face showing. */
  shown: string;
  /** Whether a flap is falling now, from `shown` to `next`. */
  flipping: boolean;
  /** The face after `shown`: the one a falling flap reveals. */
  next: string;
}

export interface FlapMotionOptions {
  /** The board's beat (see FlapClock). Without one, the drum keeps its own time. */
  clock?: FlapClock;
  /** Without a clock: called each time a flap lands. */
  onFlap?: () => void;
  /** Without a clock: told when the drum starts and stops moving. */
  tracker?: MotionTracker;
  /** With a clock: beats to wait before starting to move (rows starting in turn). */
  startDelay?: number;
  /** The board row it is in, for a clock moving a row at a time. */
  row?: number;
  /** The contents of its row, when rows clear before changing (see SplitFlapCell's rowKey). */
  rowKey?: string;
  /** With a clock: what clears with it (see SplitFlapCell's clearGroup). Defaults to `row`. */
  clearGroup?: number;
}

/**
 * How a split-flap moves from the face it shows to the one it is asked for, by Drum's rules,
 * for drums drawn through React: the whole-value flaps, of which a board has few. (The many
 * character cells work on their elements directly: see SplitFlapCell.)
 *
 * Faces are tracked by what is printed on them, not by place, so a drum that gains faces
 * while it turns (see WholeValueFlap) does not make it jump.
 *
 * @param blank the blank face, where every drum starts
 * @param nextOf the face after a given one, coming round to the first after the last
 */
export function useFlapMotion(
  blank: string,
  target: string,
  nextOf: (face: string) => string,
  flipMs: number,
  { clock, onFlap, tracker, startDelay = 0, row = 0, rowKey, clearGroup }: FlapMotionOptions = {}
): FlapMotion {
  const drumRef = useRef<Drum | null>(null);
  drumRef.current ??= new Drum(blank, nextOf);
  const drum = drumRef.current;
  const [, redraw] = useState(0);
  const onFlapRef = useRef(onFlap);
  onFlapRef.current = onFlap;

  // What the board's clock moves: the drum, drawn again after each beat.
  const moverRef = useRef<FlapMover | null>(null);
  moverRef.current ??= {
    step: () => {
      const d = drumRef.current!;
      // A hidden tab throttles timers; nobody is watching, so settle.
      let landed = false;
      if (document.hidden) d.settle();
      else landed = d.step();
      redraw((n) => n + 1);
      return landed;
    },
    get cleared() {
      return drumRef.current!.cleared;
    },
    release: () => drumRef.current!.release(),
    get done() {
      return drumRef.current!.done;
    },
  };
  const mover = moverRef.current;

  // Tell the drum where to go, clearing first if its row's contents changed and rows clear.
  const lastRowKey = useRef<string | undefined>(undefined);
  drum.nextOf = nextOf;
  if (target !== (drum.pending ?? drum.target) || rowKey !== lastRowKey.current) {
    const clearFirst = rowKey !== undefined && lastRowKey.current !== undefined && rowKey !== lastRowKey.current;
    drum.setTarget(target, clearFirst);
    lastRowKey.current = rowKey;
  }
  const moving = drum.moving;

  // --- On the board's beat ---
  useEffect(() => {
    if (!clock || !moving) return;
    if (!clock.has(mover)) clock.join(mover, { row, wait: startDelay, clear: clearGroup ?? row });
    // The clock lets go of drums that are done; a drum given somewhere new joins again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, moving, target, rowKey]);
  useEffect(() => () => clock?.leave(mover), [clock, mover]);
  useEffect(() => () => tracker?.set(mover, false), [tracker, mover]);

  // --- In its own time ---
  const [ownFlip, setOwnFlip] = useState(0);
  useLayoutEffect(() => {
    if (clock) return;
    if (!drum.moving) {
      tracker?.set(mover, false);
      return;
    }
    if (document.hidden) {
      drum.settle();
      redraw((n) => n + 1);
      tracker?.set(mover, false);
      return;
    }
    // On its own there is no row to wait for: a drum clearing goes straight on from the blank.
    if (drum.cleared) drum.release();
    if (drum.done) {
      tracker?.set(mover, false);
      return;
    }
    tracker?.set(mover, true);
    if (!drum.flipping) {
      drum.step();
      redraw((n) => n + 1);
    }
    const timer = window.setTimeout(() => {
      drum.step();
      onFlapRef.current?.();
      setOwnFlip((n) => n + 1);
    }, flipMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, ownFlip, target, rowKey, flipMs]);

  return { shown: drum.shown, flipping: drum.flipping, next: drum.flipping ? nextOf(drum.shown) : drum.shown };
}

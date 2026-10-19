import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FlapClock } from "./flapClock";

export interface FlapMotion {
  /** The face showing. */
  shown: string;
  /** Whether a flap is falling now, from `shown` to `next`. */
  flipping: boolean;
  /** The face after `shown`: the one a falling flap reveals. */
  next: string;
}

/**
 * How a split-flap moves from the face it shows to the one it is asked for: forward, one flap
 * at a time, through every face in between. A flap already falling always finishes, even if
 * the target changes under it, just as the mechanism would.
 *
 * With a clock, every flap falls on the clock's beat, in step with the rest of the board (see
 * FlapClock). Without one, the cell keeps its own time, as it did before boards had a beat.
 *
 * Faces are tracked by what is printed on them, not by place, so a drum that gains faces
 * while it turns (see WholeValueFlap) does not make it jump.
 *
 * @param blank the blank face, where every cell starts
 * @param nextOf the face after a given one, coming round to the first after the last
 * @param onFlap without a clock: called each time a flap lands
 * @param startDelay with a clock: beats to wait before starting to move
 */
export function useFlapMotion(
  blank: string,
  target: string,
  nextOf: (face: string) => string,
  flipMs: number,
  clock?: FlapClock,
  onFlap?: () => void,
  startDelay = 0
): FlapMotion {
  // Starts on the blank, as a board does when it is switched on.
  const [shown, setShown] = useState(blank);
  const [flipping, setFlipping] = useState(false);

  // What the clock's step reads: always the latest, and moved on at once by the step itself,
  // so a second beat before React has drawn the first still knows where the drum is.
  const state = useRef({ shown, flipping, target, nextOf, onFlap });
  state.current.target = target;
  state.current.nextOf = nextOf;
  state.current.onFlap = onFlap;
  if (!clock) {
    state.current.shown = shown;
    state.current.flipping = flipping;
  }

  const moving = flipping || shown !== target;

  // --- On the board's beat ---
  useEffect(() => {
    if (!clock || !moving) return;
    const s = state.current;
    s.shown = shown;
    s.flipping = flipping;
    const step = () => {
      // A hidden tab throttles timers; nobody is watching, so settle.
      if (document.hidden) {
        s.shown = s.target;
        s.flipping = false;
        setShown(s.target);
        setFlipping(false);
        return false;
      }
      const landed = beatStep(s);
      setShown(s.shown);
      setFlipping(s.flipping);
      return landed;
    };
    clock.join(step, startDelay);
    return () => clock.leave(step);
    // Joins when the cell starts moving and leaves when it stops; the step reads the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, moving]);

  // --- In its own time ---
  // Start the next flap. A layout effect, so the cell never paints a frame standing still
  // between two flips of the same run.
  useLayoutEffect(() => {
    if (clock || flipping || shown === target) return;
    if (document.hidden) {
      setShown(target);
      return;
    }
    setFlipping(true);
  }, [clock, flipping, shown, target]);

  // Land the flap once it has fallen.
  useEffect(() => {
    if (clock || !flipping) return;
    const timer = window.setTimeout(() => {
      setShown((s) => state.current.nextOf(s));
      setFlipping(false);
      state.current.onFlap?.();
    }, flipMs);
    return () => window.clearTimeout(timer);
  }, [clock, flipping, flipMs]);

  return { shown, flipping, next: flipping ? nextOf(shown) : shown };
}

/** A drum's state between beats, as beatStep moves it on. */
export interface DrumState {
  shown: string;
  flipping: boolean;
  target: string;
  nextOf: (face: string) => string;
}

/**
 * One beat for one drum: a falling flap lands (and the drum stops if that was the face it was
 * asked for, or carries straight on into the next flap if not); a drum standing on the wrong
 * face starts falling. Returns true if a flap landed. Moves `drum` on in place.
 */
export function beatStep(drum: DrumState): boolean {
  if (drum.flipping) {
    drum.shown = drum.nextOf(drum.shown);
    if (drum.shown === drum.target) drum.flipping = false;
    return true;
  }
  if (drum.shown !== drum.target) drum.flipping = true;
  return false;
}

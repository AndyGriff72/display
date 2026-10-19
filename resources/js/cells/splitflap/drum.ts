/**
 * The rules a split-flap drum turns by, apart from drawing it: the face it shows, the flap
 * falling, the face it is going to, and (when its row clears before changing) the face it
 * will go to once the row is clear. Shared by SplitFlapCell's drums and WholeValueFlap's, and
 * moved on by FlapClock (it is a FlapMover).
 */

export interface FlapMover {
  /** One beat: a falling flap lands, or a drum on the wrong face starts falling. True if a flap landed. */
  step(): boolean;
  /** Clearing before a change, and now on the blank: waiting for the rest of its row. */
  readonly cleared: boolean;
  /** Its row is clear: go on to the new face. */
  release(): void;
  /** Where it was asked to be, with nothing left to do: it can leave the clock. */
  readonly done: boolean;
}

export class Drum implements FlapMover {
  shown: string;
  flipping = false;
  /** The face it is turning to now: the blank while clearing. */
  target: string;
  /** While clearing: the face to go on to once its row is clear. */
  pending: string | null = null;

  constructor(
    readonly blank: string,
    public nextOf: (face: string) => string
  ) {
    // Starts on the blank, as a board does when it is switched on.
    this.shown = blank;
    this.target = blank;
  }

  /**
   * Turn to `face`. With `clearFirst`, go round to the blank first and wait there for the row
   * (see FlapClock); a drum already clearing just changes the face it will go on to.
   */
  setTarget(face: string, clearFirst = false): void {
    if (clearFirst) {
      this.pending = face;
      this.target = this.blank;
    } else if (this.pending !== null) {
      this.pending = face;
    } else {
      this.target = face;
    }
  }

  get moving(): boolean {
    return this.flipping || this.shown !== this.target || this.pending !== null;
  }

  get atRest(): boolean {
    return !this.flipping && this.shown === this.target;
  }

  get cleared(): boolean {
    return this.pending !== null && this.atRest;
  }

  get done(): boolean {
    return this.atRest && this.pending === null;
  }

  release(): void {
    if (this.pending === null) return;
    this.target = this.pending;
    this.pending = null;
  }

  /**
   * One beat: a falling flap lands (and the drum stops if that was the face it was going to,
   * or carries straight on into the next flap if not); a drum standing on the wrong face starts
   * falling. Returns true if a flap landed.
   */
  step(): boolean {
    if (this.flipping) {
      this.shown = this.nextOf(this.shown);
      if (this.shown === this.target) this.flipping = false;
      return true;
    }
    if (this.shown !== this.target) this.flipping = true;
    return false;
  }

  /** Straight to where it is going, clearing and all: nobody is watching (a hidden tab). */
  settle(): void {
    this.release();
    this.shown = this.target;
    this.flipping = false;
  }
}

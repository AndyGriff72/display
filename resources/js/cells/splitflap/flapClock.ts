/**
 * The beat a split-flap board moves to.
 *
 * On a Solari board every module still moving advances on the same pulse from the controller,
 * so a row changing clatters in unison, "duh-duh-duh-duh", thinning out as each character
 * reaches its letter and drops out. A FlapClock is that pulse: cells with somewhere to go join
 * it, and on every tick each of them does its next step together, the falling flaps landing as
 * one. It runs only while some cell is moving.
 *
 * Browsers run timers late when the page is busy, so beats are counted from when the clock
 * started rather than from the last one: a late beat never pushes the rest later. Each beat
 * also says when it should have happened, so the sound can be put exactly on it.
 */

import { beatTimingOn, ChangeRecorder } from "./beatTiming";

/** A cell's part on each beat: true if a flap of its landed. */
export type FlapStep = () => boolean;

export class FlapClock {
  private steps = new Set<FlapStep>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** When beat 0 was due, in Date.now() time, and the number of the next beat. */
  private startedAt = 0;
  private beatNumber = 0;
  /** This change's timings, when the board's address asks for them (see beatTiming). */
  private recorder: ChangeRecorder | null = null;

  /**
   * @param periodMs one beat: how long a flap takes to fall
   * @param onBeat called after a beat on which flaps landed, with how many, and when the beat
   *   was due (Date.now() time): a moment ago, if the browser ran the timer late
   */
  constructor(
    readonly periodMs: number,
    private onBeat: (landed: number, dueAt: number) => void
  ) {}

  /**
   * A cell starts moving. It takes its first step on the next beat, with every other cell
   * moving, so cells that start in the same moment stay in step all the way.
   */
  join(step: FlapStep): void {
    this.steps.add(step);
    if (this.timer === null) {
      this.startedAt = Date.now();
      this.beatNumber = 1;
      this.recorder = beatTimingOn() ? new ChangeRecorder(this.periodMs) : null;
      this.schedule();
    }
  }

  leave(step: FlapStep): void {
    this.steps.delete(step);
  }

  /** Stop, forgetting every cell: the board has gone. A cell joining afterwards starts it again. */
  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.steps.clear();
    this.recorder?.end();
    this.recorder = null;
  }

  private dueAt(): number {
    return this.startedAt + this.beatNumber * this.periodMs;
  }

  private schedule(): void {
    this.timer = setTimeout(this.tick, Math.max(0, this.dueAt() - Date.now()));
  }

  private tick = (): void => {
    const dueAt = this.dueAt();
    const ranAt = Date.now();
    const t0 = performance.now();
    let landed = 0;
    for (const step of [...this.steps]) if (step()) landed++;
    const t1 = performance.now();
    if (landed > 0) this.onBeat(landed, dueAt);
    this.recorder?.beat(dueAt, ranAt, t1 - t0, performance.now() - t1);
    // Nothing left to move: rest until a cell joins again.
    if (this.steps.size === 0) {
      this.timer = null;
      this.recorder?.end();
      this.recorder = null;
      return;
    }
    // The next beat on the count; if the browser was so late that beats were missed, the next
    // one still due, so the board never races to catch up.
    this.beatNumber = Math.max(this.beatNumber + 1, Math.ceil((Date.now() - this.startedAt) / this.periodMs));
    this.schedule();
  };
}

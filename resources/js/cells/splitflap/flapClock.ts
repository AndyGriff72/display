/**
 * The beat a split-flap board moves to.
 *
 * On a Solari board every module still moving advances on the same pulse from the controller,
 * so a row changing clatters in unison, "duh-duh-duh-duh", thinning out as each character
 * reaches its letter and drops out. A FlapClock is that pulse: drums with somewhere to go join
 * it, and on every tick each of them does its next step together, the falling flaps landing as
 * one. It runs only while some drum is moving.
 *
 * It also knows each drum's row, for boards that change a row at a time: a drum can wait a
 * number of beats before starting (rows starting one after another), or (rowByRow) a row can
 * wait until the row above has finished. And when a row clears before changing, its drums
 * each go round to the blank and wait there, released together once the whole row is clear.
 *
 * Browsers run timers late when the page is busy, so beats are counted from when the clock
 * started rather than from the last one: a late beat never pushes the rest later. Each beat
 * also says when it should have happened, so the sound can be put exactly on it.
 */

import { beatTimingOn, ChangeRecorder } from "./beatTiming";
import type { FlapMover } from "./drum";

interface Place {
  row: number;
  /** Beats still to wait before the first step. */
  wait: number;
}

export class FlapClock {
  private movers = new Map<FlapMover, Place>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** When beat 0 was due, in Date.now() time, and the number of the next beat. */
  private startedAt = 0;
  private beatNumber = 0;
  /** This change's timings, when the board's address asks for them (see beatTiming). */
  private recorder: ChangeRecorder | null = null;
  /** With rowByRow: the row moving now. It finishes before any other starts. */
  private currentRow: number | null = null;

  /** Each row waits until the row above has finished (set by the board). */
  rowByRow = false;

  /**
   * @param periodMs one beat: how long a flap takes to fall
   * @param onBeat called after a beat on which flaps landed, with how many, and when the beat
   *   was due (Date.now() time): a moment ago, if the browser ran the timer late
   * @param onIdle called when the last drum has stopped: the change is over
   */
  constructor(
    readonly periodMs: number,
    private onBeat: (landed: number, dueAt: number) => void,
    private onIdle?: () => void
  ) {}

  /** Whether any drum is moving, or waiting to. */
  get busy(): boolean {
    return this.movers.size > 0;
  }

  has(mover: FlapMover): boolean {
    return this.movers.has(mover);
  }

  /**
   * A drum starts moving. It takes its first step on the next beat, with every other drum
   * moving, so drums that start in the same moment stay in step all the way; or `wait` beats
   * later, still in step; or, with rowByRow, once the rows above it have finished.
   */
  join(mover: FlapMover, { row = 0, wait = 0 }: { row?: number; wait?: number } = {}): void {
    if (!this.movers.has(mover)) this.movers.set(mover, { row, wait: Math.max(0, Math.round(wait)) });
    if (this.timer === null) {
      this.startedAt = Date.now();
      this.beatNumber = 1;
      this.recorder = beatTimingOn() ? new ChangeRecorder(this.periodMs) : null;
      this.schedule();
    }
  }

  leave(mover: FlapMover): void {
    this.movers.delete(mover);
  }

  /** Stop, forgetting every drum: the board has gone. A drum joining afterwards starts it again. */
  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.movers.clear();
    this.currentRow = null;
    this.recorder?.end();
    this.recorder = null;
  }

  private dueAt(): number {
    return this.startedAt + this.beatNumber * this.periodMs;
  }

  private schedule(): void {
    this.timer = setTimeout(this.tick, Math.max(0, this.dueAt() - Date.now()));
  }

  /** The drums that move on this beat: all of them, or with rowByRow, one row's. */
  private moving(): [FlapMover, Place][] {
    const all = [...this.movers];
    if (!this.rowByRow) return all;
    if (this.currentRow === null || !all.some(([, p]) => p.row === this.currentRow)) {
      this.currentRow = all.length ? Math.min(...all.map(([, p]) => p.row)) : null;
    }
    return all.filter(([, p]) => p.row === this.currentRow);
  }

  private tick = (): void => {
    const dueAt = this.dueAt();
    const ranAt = Date.now();
    const t0 = performance.now();
    const moving = this.moving();
    let landed = 0;
    for (const [mover, place] of moving) {
      if (!this.movers.has(mover)) continue; // left during this beat
      if (place.wait > 0) place.wait--;
      else if (mover.step()) landed++;
    }
    this.releaseClearRows(moving);
    for (const [mover] of moving) if (mover.done) this.movers.delete(mover);
    const t1 = performance.now();
    if (landed > 0) this.onBeat(landed, dueAt);
    this.recorder?.beat(dueAt, ranAt, t1 - t0, performance.now() - t1);
    // Nothing left to move: rest until a drum joins again.
    if (this.movers.size === 0) {
      this.timer = null;
      this.currentRow = null;
      this.recorder?.end();
      this.recorder = null;
      this.onIdle?.();
      return;
    }
    // The next beat on the count; if the browser was so late that beats were missed, the next
    // one still due, so the board never races to catch up.
    this.beatNumber = Math.max(this.beatNumber + 1, Math.ceil((Date.now() - this.startedAt) / this.periodMs));
    this.schedule();
  };

  /**
   * A row clearing before it changes goes on to its new characters only once every drum in it
   * is on the blank: then they all set off together, on the next beat.
   */
  private releaseClearRows(moving: [FlapMover, Place][]): void {
    const rows = new Set(moving.map(([, p]) => p.row));
    for (const row of rows) {
      const inRow = [...this.movers].filter(([, p]) => p.row === row).map(([m]) => m);
      if (inRow.some((m) => m.cleared) && inRow.every((m) => m.cleared || m.done)) {
        for (const m of inRow) if (m.cleared) m.release();
      }
    }
  }
}

/**
 * For drums that keep their own time (no clock): which are moving, so the board can still tell
 * when a change is over (paging counts from then). Drums say when they start and stop.
 */
export class MotionTracker {
  private moving = new Set<object>();

  constructor(private onIdle: () => void) {}

  get busy(): boolean {
    return this.moving.size > 0;
  }

  /** `who` is moving, or has stopped; the last to stop ends the change. */
  set(who: object, moving: boolean): void {
    if (moving) this.moving.add(who);
    else if (this.moving.delete(who) && this.moving.size === 0) this.onIdle();
  }
}

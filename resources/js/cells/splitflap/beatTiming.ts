/**
 * Timing of split-flap changes, for the readout a board shows when its address has ?timing in
 * it (see TimingReadout). Off, it costs nothing: FlapClock only reports when it is on.
 *
 * A change is a run of a clock's beats, from the moment it starts until nothing is left moving.
 * For each, it records how late the beats ran against when they were due (a late beat is the
 * board falling behind, whether our code or the browser's drawing held it up), the longest gap
 * between frames drawn, and how long each beat's own work took: moving the tiles, and the sound.
 */

export interface ChangeTiming {
  /** When the change started (Date.now() time). */
  startedAt: number;
  /** One beat, in milliseconds. */
  periodMs: number;
  beats: number;
  /** How late the first beat ran. */
  firstLateMs: number;
  /** Time lost against the beat over the first 12 beats: the start of a change, where it stalls. */
  lostMs: number;
  /** The longest time between two beats, anywhere in the change. */
  longestGapMs: number;
  /** The longest time between two frames drawn while the change ran. */
  longestFrameMs: number;
  /** Per beat, on average and at most: moving the tiles (our code, not the drawing it causes). */
  stepMs: number;
  stepMaxMs: number;
  /** Per beat, on average and at most: playing the sound. */
  soundMs: number;
  soundMaxMs: number;
  /** Whether the change is still running. */
  running: boolean;
}

/**
 * Every finished change of 12 beats or more since the page opened, summed: a steady figure to
 * read on a screen whose recent changes come and go every few seconds.
 */
export interface TimingSummary {
  changes: number;
  lostTotalMs: number;
  lostWorstMs: number;
  frameTotalMs: number;
  frameWorstMs: number;
  stepTotalMs: number;
  soundTotalMs: number;
}

const KEPT = 3;
const summary: TimingSummary = { changes: 0, lostTotalMs: 0, lostWorstMs: 0, frameTotalMs: 0, frameWorstMs: 0, stepTotalMs: 0, soundTotalMs: 0 };

export function timingSummary(): TimingSummary {
  return summary;
}
let on = false;
const changes: ChangeTiming[] = [];
const listeners = new Set<() => void>();
let frameLoop: number | null = null;
let lastFrame = 0;

/** Start recording (the readout does, when the address asks for it). */
export function enableBeatTiming(): void {
  on = true;
}

export function beatTimingOn(): boolean {
  return on;
}

export function subscribeBeatTiming(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The latest changes, newest first. */
export function recentChanges(): ChangeTiming[] {
  return changes;
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Watch frames while any change runs, for each running change's longest gap between frames. */
function watchFrames(): void {
  if (frameLoop !== null) return;
  lastFrame = performance.now();
  const frame = (t: number) => {
    const gap = t - lastFrame;
    lastFrame = t;
    const running = changes.filter((c) => c.running);
    for (const c of running) c.longestFrameMs = Math.max(c.longestFrameMs, gap);
    frameLoop = running.length > 0 ? requestAnimationFrame(frame) : null;
  };
  frameLoop = requestAnimationFrame(frame);
}

/** One change on one clock, as FlapClock reports it. */
export class ChangeRecorder {
  private readonly timing: ChangeTiming;
  private lastRanAt: number;
  private stepTotal = 0;
  private soundTotal = 0;

  constructor(periodMs: number) {
    const now = Date.now();
    this.lastRanAt = now;
    this.timing = {
      startedAt: now,
      periodMs,
      beats: 0,
      firstLateMs: 0,
      lostMs: 0,
      longestGapMs: 0,
      longestFrameMs: 0,
      stepMs: 0,
      stepMaxMs: 0,
      soundMs: 0,
      soundMaxMs: 0,
      running: true,
    };
    changes.unshift(this.timing);
    changes.length = Math.min(changes.length, KEPT);
    watchFrames();
    notify();
  }

  /** A beat ran at `ranAt`, due at `dueAt`; its steps took `stepMs` and its sound `soundMs`. */
  beat(dueAt: number, ranAt: number, stepMs: number, soundMs: number): void {
    const t = this.timing;
    const gap = ranAt - this.lastRanAt;
    this.lastRanAt = ranAt;
    t.beats++;
    if (t.beats === 1) t.firstLateMs = Math.max(0, ranAt - dueAt);
    if (t.beats <= 12) t.lostMs += Math.max(0, gap - t.periodMs);
    t.longestGapMs = Math.max(t.longestGapMs, gap);
    this.stepTotal += stepMs;
    this.soundTotal += soundMs;
    t.stepMs = this.stepTotal / t.beats;
    t.soundMs = this.soundTotal / t.beats;
    t.stepMaxMs = Math.max(t.stepMaxMs, stepMs);
    t.soundMaxMs = Math.max(t.soundMaxMs, soundMs);
    notify();
  }

  end(): void {
    const t = this.timing;
    t.running = false;
    if (t.beats >= 12) {
      summary.changes++;
      summary.lostTotalMs += t.lostMs;
      summary.lostWorstMs = Math.max(summary.lostWorstMs, t.lostMs);
      summary.frameTotalMs += t.longestFrameMs;
      summary.frameWorstMs = Math.max(summary.frameWorstMs, t.longestFrameMs);
      summary.stepTotalMs += t.stepMs;
      summary.soundTotalMs += t.soundMs;
    }
    notify();
  }
}

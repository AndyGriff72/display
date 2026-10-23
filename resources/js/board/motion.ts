/**
 * How much a board moves, for devices that cannot keep up with all of it.
 *
 * - "full": everything (split-flaps fall, lit cells print and bulbs fade, flip-dots sweep).
 * - "lighter": split-flaps still step through every flap on the beat, but each flap snaps over
 *   rather than falling; lit cells show their characters at once and bulbs switch without
 *   fading; flip-dot discs all turn together.
 * - "minimal": as lighter, and split-flaps skip through their drums in a few big jumps.
 *
 * A board set to "auto" (the default) starts at the level this device last settled on and
 * watches each change: how long frames take and how late the beats run. A change it could not
 * keep up with steps it down a level; a run of changes it kept up with easily steps it back up.
 * A step up that fails at once makes the next one wait twice as long, so a device on the edge
 * does not go up and down all day.
 */

export const MOTION_LEVELS = ["full", "lighter", "minimal"] as const;
export type MotionLevel = (typeof MOTION_LEVELS)[number];
export const MOTION_SETTINGS = ["auto", ...MOTION_LEVELS] as const;
export type MotionSetting = (typeof MOTION_SETTINGS)[number];

/** What one change looked like, for deciding whether the device kept up. */
export interface ChangeLoad {
  /** The gaps between frames drawn while it ran, in milliseconds. */
  frames: number[];
  /**
   * For each split-flap beat, how long after it was due its flaps reached the screen (see
   * RenderLag), in milliseconds; and how long a beat is.
   */
  late: number[];
  periodMs: number;
}

export type Verdict = "behind" | "easy" | "fine" | "unknown";

/** Too short a change to judge by. */
const FEWEST_FRAMES = 15;
const FEWEST_BEATS = 5;

/**
 * Whether a change kept up. Exported for the tests.
 *
 * Split-flap changes go by how late their beats reach the screen, since that is what the eye
 * and ear notice: a flap's fall runs on the graphics card, smooth however slowly the page's
 * own frames come, but a beat drawn late shows behind its sound and the rhythm. Behind: half
 * the beats reached the screen over a beat and a half late. Easy: nine in ten within a beat.
 *
 * Other changes (flip-dot discs turning, lit cells printing) are drawn frame by frame, so they
 * go by the frames. Behind: a quarter took over 50 ms (under 20 a second). Easy: nine in ten
 * within 34 ms (two frames of a 60 Hz screen).
 */
export function judge({ frames, late, periodMs }: ChangeLoad): Verdict {
  if (late.length >= FEWEST_BEATS) {
    if (share(late, 0.5) > 1.5 * periodMs) return "behind";
    return share(late, 0.9) <= periodMs ? "easy" : "fine";
  }
  if (frames.length < FEWEST_FRAMES) return "unknown";
  if (share(frames, 0.75) > 50) return "behind";
  return share(frames, 0.9) <= 34 ? "easy" : "fine";
}

/** The value `part` of the way up the sorted list: 0.5 the median, 0.9 nine in ten within. */
function share(values: number[], part: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * part))];
}

/** Easy changes in a row before stepping up, at first, and at most after failed steps up. */
const CALM_FIRST = 3;
const CALM_MOST = 24;
const STORAGE_KEY = "display.motion";

export interface MotionEvent {
  at: number;
  from: MotionLevel;
  to: MotionLevel;
  why: string;
}

interface Watched {
  adaptive: boolean;
  frames: number[];
  late: number[];
  periodMs: number;
}

/** The level an "auto" board uses on this device, and how it got there. */
export class MotionGovernor {
  level: MotionLevel = "full";
  /** Easy changes in a row so far, and how many it takes to step up. */
  private calm = 0;
  private calmNeeded = CALM_FIRST;
  /** The level was just stepped up: if the next change is behind, the step up failed. */
  private justUp = false;
  /** The last few changes of level, newest first, and the last change's verdict. */
  readonly history: MotionEvent[] = [];
  lastVerdict: Verdict = "unknown";
  /** The last change's figures, as words, for the timing readout. */
  lastFigures = "";
  /** Counts every change judged, so the readout knows to draw again even if nothing else differs. */
  version = 0;
  private listeners = new Set<() => void>();

  // The change being watched.
  private watching: Watched | null = null;
  /** A change just over, still taking its last beats' measurements (see end). */
  private closing: Watched | null = null;
  private loop: number | null = null;
  private lastFrame = 0;

  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage()) {
    try {
      const saved = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? "null");
      if (saved && MOTION_LEVELS.includes(saved.level)) this.level = saved.level;
      if (saved && typeof saved.calmNeeded === "number") this.calmNeeded = Math.min(CALM_MOST, Math.max(CALM_FIRST, saved.calmNeeded));
    } catch {
      // Nothing saved, or storage not allowed: start at full.
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getLevel = (): MotionLevel => this.level;

  /**
   * Something on the board has started moving: watch frames until it stops. `adaptive`: the
   * board is on "auto", so what is seen can change the level (otherwise it is only recorded).
   */
  begin(adaptive: boolean): void {
    if (this.watching) return;
    this.watching = { adaptive, frames: [], late: [], periodMs: 80 };
    if (typeof requestAnimationFrame === "undefined") return;
    this.lastFrame = performance.now();
    const frame = (t: number) => {
      if (!this.watching) return;
      this.watching.frames.push(t - this.lastFrame);
      this.lastFrame = t;
      this.loop = requestAnimationFrame(frame);
    };
    this.loop = requestAnimationFrame(frame);
  }

  /** A split-flap beat reached the screen `lateMs` after it was due (see RenderLag). */
  shown(lateMs: number, periodMs: number): void {
    const w = this.closing ?? this.watching;
    if (!w) return;
    w.late.push(Math.max(0, lateMs));
    w.periodMs = periodMs;
  }

  /** Everything has stopped: judge the change, and step the level if it calls for it. */
  end(): void {
    const w = this.watching;
    this.watching = null;
    if (this.loop !== null) cancelAnimationFrame(this.loop);
    this.loop = null;
    if (!w) return;
    // The last beats reach the screen a frame or two from now (see RenderLag): judge after them.
    this.closing = w;
    const judgeIt = () => {
      if (this.closing !== w) return;
      this.closing = null;
      // A hidden page draws no frames: nothing to learn from it.
      if (typeof document !== "undefined" && document.hidden) return;
      this.observe({ frames: w.frames.slice(1), late: w.late, periodMs: w.periodMs }, w.adaptive);
    };
    if (typeof requestAnimationFrame === "undefined") judgeIt();
    else requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(judgeIt)));
  }

  /** Take a finished change into account. Exported through the class for the tests. */
  observe(load: ChangeLoad, adaptive = true): void {
    const verdict = judge(load);
    this.lastVerdict = verdict;
    this.lastFigures = figures(load);
    if (!adaptive || verdict === "unknown") return this.notify();
    const i = MOTION_LEVELS.indexOf(this.level);
    if (verdict === "behind") {
      if (this.justUp) this.calmNeeded = Math.min(CALM_MOST, this.calmNeeded * 2);
      this.justUp = false;
      this.calm = 0;
      if (i < MOTION_LEVELS.length - 1) this.step(MOTION_LEVELS[i + 1], describe(load, "could not keep up"));
    } else {
      this.justUp = false;
      this.calm = verdict === "easy" ? this.calm + 1 : 0;
      if (this.calm >= this.calmNeeded && i > 0) {
        this.calm = 0;
        this.justUp = true;
        this.step(MOTION_LEVELS[i - 1], `${this.calmNeeded} changes in a row kept up easily`);
      }
    }
    this.notify();
  }

  private step(to: MotionLevel, why: string): void {
    this.history.unshift({ at: Date.now(), from: this.level, to, why });
    this.history.length = Math.min(this.history.length, 5);
    this.level = to;
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify({ level: to, calmNeeded: this.calmNeeded }));
    } catch {
      // Not remembered: the next visit starts from full again.
    }
  }

  private notify(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}

/** A change's frames and beats in words: what judge goes by. */
export function figures({ frames, late, periodMs }: ChangeLoad): string {
  if (!frames.length) return "no frames";
  const at = (values: number[], part: number) => Math.round(share(values, part));
  const beats = late.length
    ? `; ${late.length} beats on screen: half within ${at(late, 0.5)} ms of due, 9 in 10 within ${at(late, 0.9)} (a beat is ${periodMs} ms)`
    : "";
  return `${frames.length} frames: half within ${at(frames, 0.5)} ms, 3 in 4 within ${at(frames, 0.75)}, 9 in 10 within ${at(frames, 0.9)}${beats}`;
}

function describe({ frames, late, periodMs }: ChangeLoad, what: string): string {
  if (late.length >= FEWEST_BEATS) return `${what}: beats reached the screen ${Math.round(share(late, 0.5))} ms late, half of them (a beat is ${periodMs} ms)`;
  return `${what}: ${frames.filter((f) => f > 50).length} of ${frames.length} frames over 50 ms`;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** The one for this device, shared by every board on the page. */
export const motionGovernor = new MotionGovernor();

/** The level a board's setting gives, an address's ?motion= taking precedence over it. */
export function settingFromAddress(given: MotionSetting | undefined): MotionSetting {
  const asked = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("motion") : null;
  if (asked && (MOTION_SETTINGS as readonly string[]).includes(asked)) return asked as MotionSetting;
  return given ?? "auto";
}

/**
 * How far behind its beat the board's drawing reaches the screen, so the sound can wait for it.
 *
 * Each beat's sound is put on the beat (see FlapSound.beat). A device that cannot draw a beat's
 * flaps in time shows them later than that, and the sound runs ahead of the picture. So after
 * each beat this waits for the next frame after the one that drew it, and keeps a running
 * average of how long after the beat that came. Sound then waits however much of that is more
 * than its usual latency already allows for: nothing on a device that keeps up, and the
 * rhythm stays as steady as the beats themselves.
 */
export class RenderLag {
  private lag = 0;

  constructor(private readonly allowanceMs: number) {}

  /**
   * A beat due at `dueAt` (Date.now() time) has just changed the board. `measured` is told how
   * late it reached the screen.
   */
  note(dueAt: number, measured?: (lagMs: number) => void): void {
    if (typeof requestAnimationFrame === "undefined") return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const lag = Math.max(0, Date.now() - dueAt);
        measured?.(lag);
        // Rises quickly, so the sound catches up with a struggling device; falls slowly.
        this.lag = lag > this.lag ? this.lag + (lag - this.lag) * 0.5 : this.lag + (lag - this.lag) * 0.1;
      })
    );
  }

  /** How much longer than usual the sound should wait, in milliseconds. */
  get extraMs(): number {
    return Math.max(0, Math.round(this.lag - this.allowanceMs));
  }
}

/**
 * A split-flap's jump in minimal motion: from `left` flaps short of its target, how far the
 * next flap goes, so it gets there in about MINIMAL_JUMPS beats. Exported for the tests.
 */
export function minimalStride(left: number): number {
  return Math.max(1, Math.ceil(left / MINIMAL_JUMPS));
}

/** How many beats a split-flap takes to reach its character in minimal motion, at most. */
export const MINIMAL_JUMPS = 4;

import { memo, useLayoutEffect, useRef, type CSSProperties } from "react";
import { minimalStride, type MotionLevel } from "../../board/motion";
import { CHARSETS } from "../charsets";
import type { CellProps } from "../types";
import type { FlapClock, MotionTracker } from "./flapClock";
import { flapIndex, flipsBetween, nextFlap, normalizeStack } from "./flapStack";
import { Drum, type FlapMover } from "./drum";
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
  /** Without a clock: told when the cell starts and stops moving, so the board knows when it is still. */
  tracker?: MotionTracker;
  /** With a clock: how many beats to wait before starting to move (rows starting in turn). */
  startDelay?: number;
  /** The board row it is in, for a clock moving a row at a time. */
  row?: number;
  /**
   * The contents of its whole row, given when rows clear before changing: when they change, the
   * cell goes round to the blank and waits for the rest of the row before going on.
   */
  rowKey?: string;
  /** With a clock: what clears with it before a change (its row, or its whole card). Defaults to `row`. */
  clearGroup?: number;
  /** The flaps' colour, instead of the usual near-black. Any CSS colour. */
  background?: string;
  /**
   * How much it moves (see motion.ts): "full", each flap falls; "lighter", each snaps over;
   * "minimal", it snaps over in a few big jumps rather than through every flap.
   */
  motion?: MotionLevel;
}

/**
 * One split-flap character. It never jumps to a character: it flips forward through every
 * flap in its stack, one at a time, until it reaches the one it was asked for (or, in minimal
 * motion, through a few of them).
 *
 * A board can have hundreds of these, each landing a flap on every beat while it moves, so the
 * movement does not go through React: React draws the cell once, and each beat then changes
 * its letters in place and restarts the fall (see FlapDrum). Nothing is created or thrown away
 * as it turns, and nothing else on the page is redrawn.
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
  tracker,
  startDelay = 0,
  row = 0,
  rowKey,
  clearGroup,
  background,
  motion = "full",
  className,
  style,
}: SplitFlapCellProps) {
  const stack = normalizeStack(givenStack);
  const target = stack[flapIndex(char, stack)];
  const root = useRef<HTMLDivElement>(null);
  const drum = useRef<FlapDrum | null>(null);

  // The drum is made once, with the cell, and told about every change after.
  useLayoutEffect(() => {
    const d = new FlapDrum(root.current!, stack[0]);
    drum.current = d;
    return () => {
      d.stop();
      drum.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    drum.current?.set({ target, stack, flipMs, clock, onFlap, tracker, startDelay, row, rowKey, clearGroup, motion });
  });

  const vars = {
    "--sf-w": `${width}px`,
    "--sf-h": `${height}px`,
    "--sf-font-size": `${fontSize ?? Math.round(height * 0.78)}px`,
    ...(fontFamily ? { "--sf-font": fontFamily } : {}),
    ...(color ? { "--sf-fg": color } : {}),
    ...(background ? flapShades(background) : {}),
    ...style,
  } as CSSProperties;

  // The glyphs are left empty here: FlapDrum writes them, and React never touches them again.
  return (
    <div ref={root} className={`sf-cell${className ? ` ${className}` : ""}`} style={vars} aria-label={target}>
      {/* What is revealed behind the falling flap: the next character's top, the old one's bottom. */}
      <span className="sf-half sf-top" aria-hidden>
        <span className="sf-glyph" />
      </span>
      <span className="sf-half sf-bottom" aria-hidden>
        <span className="sf-glyph" />
      </span>
      {/* The falling flap: the old character's top, then (its back) the next one's bottom. */}
      <span className="sf-flap-pair" style={{ visibility: "hidden" }}>
        <span className="sf-half sf-top sf-flap" aria-hidden>
          <span className="sf-glyph" />
        </span>
        <span className="sf-half sf-bottom sf-flap" aria-hidden>
          <span className="sf-glyph" />
        </span>
      </span>
    </div>
  );
});

/**
 * How many flaps long the fall's animations are: the fall, then the flap held where it landed.
 * Far more than a beat ever takes, so the next beat always rewinds them before they come round.
 */
const FALL_HOLD = 64;

interface DrumSettings {
  target: string;
  stack: string;
  flipMs: number;
  clock?: FlapClock;
  onFlap?: () => void;
  tracker?: MotionTracker;
  startDelay?: number;
  row?: number;
  rowKey?: string;
  clearGroup?: number;
  motion?: MotionLevel;
}

/**
 * A split-flap cell's mechanism, working on its elements directly: which flap shows, the flap
 * falling, and moving on, on the board's beat (see FlapClock) or, without one, in its own time.
 * The rules for each step are Drum's, as for the whole-value flaps.
 */
class FlapDrum implements FlapMover {
  private readonly drum: Drum;
  private settings: DrumSettings = { target: " ", stack: " ", flipMs: 80 };
  /** The row's contents last time: when they change (and the row clears first), it clears. */
  private rowKey: string | undefined = undefined;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /**
   * The four glyphs' text: the two halves at rest, and the two of the falling flap. Changed in
   * place, which is cheaper for the browser than replacing it.
   */
  private readonly glyphs: Text[];
  /** What each glyph shows, so a beat only writes the letters that change. */
  private readonly written: (string | null)[] = [null, null, null, null];
  private readonly flapPair: HTMLElement;
  private readonly flapHalves: [HTMLElement, HTMLElement];
  /** The fall's two animations, made once and rewound for every flap. */
  private falling: [Animation, Animation] | null = null;
  private fallingMs = 0;
  private pairShown = false;
  /** In minimal motion: the target the jump size was worked out for, and the jump. */
  private strideFor: string | null = null;
  private stride = 1;

  constructor(root: HTMLElement, blank: string) {
    const glyph = (half: Element) => half.querySelector(".sf-glyph")!.appendChild(document.createTextNode(""));
    const [top, bottom, pair] = Array.from(root.children) as HTMLElement[];
    const [flapTop, flapBottom] = Array.from(pair.children) as HTMLElement[];
    this.glyphs = [glyph(top), glyph(bottom), glyph(flapTop), glyph(flapBottom)];
    this.flapPair = pair;
    this.flapHalves = [flapTop, flapBottom];
    this.drum = new Drum(blank, (c) => c);
    this.draw();
  }

  set(settings: DrumSettings): void {
    const old = this.settings;
    this.settings = settings;
    const { stack } = settings;
    const at = (c: string) => Math.max(0, stack.indexOf(c));
    if (settings.motion === "minimal") {
      // A few big jumps to the target, each the same size, worked out when it is first set off for.
      this.drum.nextOf = (c) => {
        const left = flipsBetween(at(c), at(this.drum.target), stack);
        if (left === 0) return stack[nextFlap(at(c), stack)];
        if (this.strideFor !== this.drum.target) {
          this.strideFor = this.drum.target;
          this.stride = minimalStride(left);
        }
        return stack[(at(c) + Math.min(this.stride, left)) % stack.length];
      };
    } else {
      this.drum.nextOf = (c) => stack[nextFlap(at(c), stack)];
    }
    if (old.motion !== settings.motion) this.draw();
    // The row's contents changed, and rows clear first: go round to the blank, then on.
    const clearFirst = settings.rowKey !== undefined && this.rowKey !== undefined && settings.rowKey !== this.rowKey;
    this.rowKey = settings.rowKey;
    this.drum.setTarget(settings.target, clearFirst);
    // A different beat (or none): leave the old one, and move on the new.
    if (old.clock !== settings.clock) {
      old.clock?.leave(this);
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
    }
    this.go();
  }

  stop(): void {
    this.settings.clock?.leave(this);
    this.settings.tracker?.set(this, false);
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.falling?.forEach((a) => a.cancel());
    this.falling = null;
  }

  /** Start moving if there is somewhere to go and the drum is not already on its way. */
  private go(): void {
    if (!this.drum.moving) return;
    const { clock } = this.settings;
    if (clock) {
      if (!clock.has(this)) clock.join(this, { row: this.settings.row, wait: this.settings.startDelay, clear: this.settings.clearGroup ?? this.settings.row });
    } else if (this.timer === null) {
      this.ownTime();
    }
  }

  // --- FlapMover: what the board's clock asks of it on each beat ---

  get clearing(): boolean {
    return this.drum.clearing;
  }

  get cleared(): boolean {
    return this.drum.cleared;
  }

  get done(): boolean {
    return this.drum.done;
  }

  release(): void {
    this.drum.release();
  }

  step(): boolean {
    // A hidden tab throttles timers; nobody is watching, so settle.
    if (document.hidden) {
      this.drum.settle();
      this.draw();
      return false;
    }
    const landed = this.drum.step();
    this.draw();
    return landed;
  }

  /** Without a clock: start the next flap now, and land it once it has fallen. */
  private ownTime(): void {
    if (document.hidden) {
      this.drum.settle();
      this.draw();
      this.settings.tracker?.set(this, false);
      return;
    }
    // On its own there is no row to wait for: a drum clearing goes straight on from the blank.
    if (this.drum.cleared) this.drum.release();
    if (this.drum.done) {
      this.settings.tracker?.set(this, false);
      return;
    }
    this.settings.tracker?.set(this, true);
    if (!this.drum.flipping) {
      this.drum.step();
      this.draw();
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.drum.step();
      this.settings.onFlap?.();
      this.draw();
      this.ownTime();
    }, this.settings.flipMs);
  }

  /**
   * Show the drum as it is: the face showing and, while a flap falls, the next one behind it,
   * the fall starting again from the top for every flap. With less motion, flaps do not fall:
   * the face showing just changes as each lands.
   */
  private draw(): void {
    const { shown } = this.drum;
    const flipping = this.drum.flipping && (this.settings.motion ?? "full") === "full";
    const next = flipping ? this.drum.nextOf(shown) : shown;
    this.write(0, next);
    this.write(1, shown);
    if (flipping) {
      this.write(2, shown);
      this.write(3, next);
      this.fall();
    }
    if (flipping !== this.pairShown) {
      this.pairShown = flipping;
      this.flapPair.style.visibility = flipping ? "visible" : "hidden";
      // At rest: stop the fall's animations, so they cost nothing until the next change.
      if (!flipping) this.falling?.forEach((a) => a.pause());
    }
  }

  private write(i: number, text: string): void {
    if (this.written[i] === text) return;
    this.written[i] = text;
    this.glyphs[i].data = text;
  }

  /**
   * The flap falling: the top folds down over the hinge and out of sight, darkening as it turns
   * away from the light; then its back, the next character's bottom, swings down and lands.
   * The animations are made the first time and rewound to the start for every flap after.
   *
   * The fall is the first beat of a much longer animation, the rest of which holds still: so
   * the animations are still running when the next beat rewinds them, and the browser keeps the
   * two halves as they are on the graphics card from one flap to the next. (An animation that
   * finished every beat had them set up afresh for every flap, which on a busy board was
   * enough to leave no time to show the falls at all.) They are paused when the cell stops.
   */
  private fall(): void {
    const { flipMs } = this.settings;
    if (!this.falling || this.fallingMs !== flipMs) {
      this.falling?.forEach((a) => a.cancel());
      const [top, bottom] = this.flapHalves;
      // The fall's two halves as fractions of the whole animation, FALL_HOLD flaps long.
      const h = 1 / (2 * FALL_HOLD);
      const turn = (deg: number) => `rotateX(${deg}deg)`;
      const lit = { filter: "brightness(1)" };
      const dim = { filter: "brightness(0.55)" };
      const timing = { duration: flipMs * FALL_HOLD, iterations: Infinity };
      this.falling = [
        top.animate(
          [
            { offset: 0, transform: turn(0), ...lit, easing: "ease-in" },
            { offset: h, transform: turn(-90), ...dim },
            { offset: 1, transform: turn(-90), ...dim },
          ],
          { ...timing, id: "sf-fall-top" }
        ),
        bottom.animate(
          [
            { offset: 0, transform: turn(90), ...dim },
            { offset: h, transform: turn(90), ...dim, easing: "ease-out" },
            { offset: 2 * h, transform: turn(0), ...lit },
            { offset: 1, transform: turn(0), ...lit },
          ],
          { ...timing, id: "sf-fall-bottom" }
        ),
      ];
      this.fallingMs = flipMs;
      return;
    }
    for (const a of this.falling) {
      a.currentTime = 0;
      if (a.playState !== "running") a.play();
    }
  }
}

/**
 * A flap colour and the darker shades the flap's styles use with it, in the same proportions
 * as the default near-black ones (--sf-bg-a and --sf-bg-b about 88% and 70% of --sf-bg).
 */
export function flapShades(colour: string): Record<string, string> {
  const shade = (percent: number) => `color-mix(in srgb, ${colour} ${percent}%, #000)`;
  return { "--sf-bg": colour, "--sf-bg-a": shade(88), "--sf-bg-b": shade(70), "--sf-bg-edge": shade(58) };
}

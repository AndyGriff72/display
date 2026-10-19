import { memo, useLayoutEffect, useRef, type CSSProperties } from "react";
import { CHARSETS } from "../charsets";
import type { CellProps } from "../types";
import type { FlapClock } from "./flapClock";
import { flapIndex, nextFlap, normalizeStack } from "./flapStack";
import { beatStep, type DrumState } from "./useFlapMotion";
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
  /** The flaps' colour, instead of the usual near-black. Any CSS colour. */
  background?: string;
}

/**
 * One split-flap character. It never jumps to a character: it flips forward through every
 * flap in its stack, one at a time, until it reaches the one it was asked for.
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
  background,
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
    drum.current?.set({ target, stack, flipMs, clock, onFlap });
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

interface DrumSettings {
  target: string;
  stack: string;
  flipMs: number;
  clock?: FlapClock;
  onFlap?: () => void;
}

/**
 * A split-flap cell's mechanism, working on its elements directly: which flap shows, the flap
 * falling, and moving on, on the board's beat (see FlapClock) or, without one, in its own time.
 * The rules for each step are beatStep's, as for the whole-value flaps.
 */
class FlapDrum {
  private state: DrumState;
  private settings: DrumSettings = { target: " ", stack: " ", flipMs: 80 };
  private joined: FlapClock | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The four glyphs: the two halves at rest, and the two of the falling flap. */
  private readonly glyphs: HTMLElement[];
  /** What each glyph shows, so a beat only writes the letters that change. */
  private readonly written: (string | null)[] = [null, null, null, null];
  private readonly flapPair: HTMLElement;
  private readonly flapHalves: [HTMLElement, HTMLElement];
  /** The fall's two animations, made once and rewound for every flap. */
  private falling: [Animation, Animation] | null = null;
  private fallingMs = 0;
  private pairShown = false;

  constructor(root: HTMLElement, blank: string) {
    const glyph = (half: Element) => half.querySelector<HTMLElement>(".sf-glyph")!;
    const [top, bottom, pair] = Array.from(root.children) as HTMLElement[];
    const [flapTop, flapBottom] = Array.from(pair.children) as HTMLElement[];
    this.glyphs = [glyph(top), glyph(bottom), glyph(flapTop), glyph(flapBottom)];
    this.flapPair = pair;
    this.flapHalves = [flapTop, flapBottom];
    // Starts on the blank, as a board does when it is switched on.
    this.state = { shown: blank, flipping: false, target: blank, nextOf: (c) => c };
    this.draw();
  }

  set(settings: DrumSettings): void {
    const old = this.settings;
    this.settings = settings;
    const { stack } = settings;
    this.state.target = settings.target;
    this.state.nextOf = (c) => stack[nextFlap(Math.max(0, stack.indexOf(c)), stack)];
    // A different beat (or none): leave the old one, and move on the new.
    if (old.clock !== settings.clock) {
      this.joined?.leave(this.step);
      this.joined = null;
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
    }
    this.go();
  }

  stop(): void {
    this.joined?.leave(this.step);
    this.joined = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.falling?.forEach((a) => a.cancel());
    this.falling = null;
  }

  private get moving(): boolean {
    return this.state.flipping || this.state.shown !== this.state.target;
  }

  /** Start moving if there is somewhere to go and the drum is not already on its way. */
  private go(): void {
    if (!this.moving) return;
    const { clock } = this.settings;
    if (clock) {
      if (this.joined !== clock) {
        this.joined = clock;
        clock.join(this.step);
      }
    } else if (this.timer === null) {
      this.ownTime();
    }
  }

  /** One beat of the board's clock. */
  private step = (): boolean => {
    // A hidden tab throttles timers; nobody is watching, so settle.
    if (document.hidden) {
      this.settle();
      return false;
    }
    const landed = beatStep(this.state);
    this.draw();
    if (!this.moving) {
      this.joined?.leave(this.step);
      this.joined = null;
    }
    return landed;
  };

  /** Without a clock: start the next flap now, and land it once it has fallen. */
  private ownTime(): void {
    if (document.hidden) {
      this.settle();
      return;
    }
    this.state.flipping = true;
    this.draw();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.state.shown = this.state.nextOf(this.state.shown);
      this.settings.onFlap?.();
      if (this.state.shown === this.state.target) {
        this.state.flipping = false;
        this.draw();
      } else {
        this.ownTime();
      }
    }, this.settings.flipMs);
  }

  private settle(): void {
    this.state.shown = this.state.target;
    this.state.flipping = false;
    this.joined?.leave(this.step);
    this.joined = null;
    this.draw();
  }

  /**
   * Show the drum as it is: the face showing and, while a flap falls, the next one behind it,
   * the fall starting again from the top for every flap.
   */
  private draw(): void {
    const { shown, flipping } = this.state;
    const next = flipping ? this.state.nextOf(shown) : shown;
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
    }
  }

  private write(i: number, text: string): void {
    if (this.written[i] === text) return;
    this.written[i] = text;
    this.glyphs[i].textContent = text;
  }

  /**
   * The flap falling: the top folds down over the hinge and out of sight, darkening as it turns
   * away from the light; then its back, the next character's bottom, swings down and lands.
   * The animations are made the first time and rewound to the start for every flap after.
   */
  private fall(): void {
    const half = this.settings.flipMs / 2;
    if (!this.falling || this.fallingMs !== half) {
      this.falling?.forEach((a) => a.cancel());
      const [top, bottom] = this.flapHalves;
      this.falling = [
        top.animate(
          [
            { transform: "rotateX(0deg)", filter: "brightness(1)" },
            { transform: "rotateX(-90deg)", filter: "brightness(0.55)" },
          ],
          { duration: half, easing: "ease-in", fill: "forwards", id: "sf-fall-top" }
        ),
        bottom.animate(
          [
            { transform: "rotateX(90deg)", filter: "brightness(0.55)" },
            { transform: "rotateX(0deg)", filter: "brightness(1)" },
          ],
          { duration: half, delay: half, easing: "ease-out", fill: "both", id: "sf-fall-bottom" }
        ),
      ];
      this.fallingMs = half;
      return;
    }
    for (const a of this.falling) {
      a.currentTime = 0;
      a.play();
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

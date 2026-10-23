/**
 * Drawing flip-dot characters on canvases, and turning their discs.
 *
 * A board can have hundreds of flip-dot characters of 35 discs each. Drawn as elements of their
 * own, every disc turning over meant the browser restyling and repainting it on every frame,
 * thousands at once, and the page stalled for seconds. So each character is one canvas: a disc
 * is drawn once, bright side and dark side (see discImage), and copied into place; and one
 * shared loop (see the end of this file) redraws, frame by frame, only the discs turning over.
 * The sweep across the board means only a narrow band of discs is turning at any moment.
 */

import { DOT_COLUMNS, DOT_ROWS } from "../dotmatrix/font5x7";

/** How long one disc takes to turn over, in milliseconds. */
export const FLIP_MS = 140;

/** The delay between one column of discs and the next, as the sign's controller sweeps across. */
export const SWEEP_STEP_MS = 7;

export const DOTS = DOT_COLUMNS * DOT_ROWS;

/** How narrow a disc gets when edge-on, halfway through turning, as a share of its width. */
const EDGE_ON = 0.06;

/** A disc's diameter, as a share of the pitch between discs. */
const DISC = 0.86;

export interface FlipDotLook {
  width: number;
  height: number;
  /** The bright side. */
  color: string;
  /** The dark side. */
  background: string;
  /** Which column of the board the character is in: the sweep runs across the whole board. */
  sweepIndex: number;
}

interface Turn {
  start: number;
  from: boolean[];
  to: boolean[];
  /** Discs that have finished turning (or never needed to). */
  done: boolean[];
}

/** One flip-dot character's canvas: what its discs show, and any turn under way. */
export class FlipDotPainter {
  private lit: boolean[] = Array<boolean>(DOTS).fill(false);
  private turn: Turn | null = null;
  private look: FlipDotLook;
  /** Canvas pixels per CSS pixel, the size it appears on screen included. */
  private ratio = 0;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    look: FlipDotLook,
    /** Told when the character starts and stops turning, so the board knows when it is still. */
    private readonly onMoving: (moving: boolean) => void
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.look = look;
    painters.add(this);
    this.paintAll();
  }

  /** New colours or size: draw everything again. */
  setLook(look: FlipDotLook): void {
    const old = this.look;
    this.look = look;
    if (old.width !== look.width || old.height !== look.height || old.color !== look.color || old.background !== look.background) this.paintAll();
  }

  /**
   * Turn the discs that differ to show `target`, sweeping across from left to right. A turn
   * still under way finishes at once first. Returns the delay (ms) of each column that turns,
   * for the sound, or an empty list if nothing changes. Without `sweep` (less motion), the discs
   * that differ just show their new sides, all at once.
   */
  show(target: boolean[], sweep = true): number[] {
    if (this.turn) this.finish();
    const changed = target.map((on, i) => on !== this.lit[i]);
    if (!changed.some(Boolean)) return [];
    if (typeof document !== "undefined" && document.hidden) {
      // Nobody is watching, and animation frames do not run: just show it.
      this.lit = target;
      this.paintAll();
      return [];
    }
    if (!sweep) {
      this.lit = target;
      this.paintAll();
      const columns = new Set<number>();
      changed.forEach((c, i) => c && columns.add(i % DOT_COLUMNS));
      return [...columns].map(() => 0);
    }
    this.turn = { start: performance.now(), from: this.lit, to: target, done: changed.map((c) => !c) };
    this.lit = target;
    this.paintAll(); // checks the canvas still matches its size on screen
    this.onMoving(true);
    animate(this);
    const columns = new Set<number>();
    changed.forEach((c, i) => c && columns.add(i % DOT_COLUMNS));
    return [...columns].map((c) => this.delay(c));
  }

  dispose(): void {
    painters.delete(this);
    turning.delete(this);
    if (this.turn) this.onMoving(false);
    this.turn = null;
  }

  private delay(column: number): number {
    return (this.look.sweepIndex * DOT_COLUMNS + column) * SWEEP_STEP_MS;
  }

  /** Where disc i is, and how big, in CSS pixels. */
  private geometry() {
    const { width, height } = this.look;
    const pitch = Math.min(width / DOT_COLUMNS, height / DOT_ROWS);
    return {
      pitch,
      disc: pitch * DISC,
      left: (width - pitch * DOT_COLUMNS) / 2,
      top: (height - pitch * DOT_ROWS) / 2,
    };
  }

  /** Canvas pixels per CSS pixel, for the size the canvas appears on screen now. */
  private ratioOnScreen(): number {
    const shown = this.canvas.getBoundingClientRect();
    const onScreen = shown.width > 0 ? shown.width / this.look.width : 1;
    return Math.min(8, Math.max(1, (window.devicePixelRatio || 1) * onScreen));
  }

  /** Size the canvas to how big it appears, then draw every disc as it stands now. */
  paintAll(): void {
    const { width, height } = this.look;
    const ratio = this.ratioOnScreen();
    if (Math.abs(ratio - this.ratio) > 0.01 || this.canvas.width !== Math.round(width * ratio)) {
      this.ratio = ratio;
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
    }
    const ctx = this.ctx;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const now = performance.now();
    for (let i = 0; i < DOTS; i++) this.paintDisc(i, now, false);
  }

  /** Draw disc i as it is at `now`: on its old side, turning, or on its new side. */
  private paintDisc(i: number, now: number, clear: boolean): void {
    const { pitch, disc, left, top } = this.geometry();
    const column = i % DOT_COLUMNS;
    const row = Math.floor(i / DOT_COLUMNS);
    const cx = left + (column + 0.5) * pitch;
    const cy = top + (row + 0.5) * pitch;
    let bright = this.lit[i];
    let squeeze = 1;
    const turn = this.turn;
    if (turn && !turn.done[i]) {
      const t = (now - turn.start - this.delay(column)) / FLIP_MS;
      if (t < 0) bright = turn.from[i];
      else if (t < 1) {
        // Narrowing to its edge on the old side, then opening out on the new (as the CSS
        // animation did: ease-in-out each way, sides swapping halfway).
        const half = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
        const eased = half * half * (3 - 2 * half);
        squeeze = t < 0.5 ? 1 - (1 - EDGE_ON) * eased : EDGE_ON + (1 - EDGE_ON) * eased;
        bright = t < 0.5 ? turn.from[i] : turn.to[i];
      }
    }
    const ctx = this.ctx;
    if (clear) ctx.clearRect(cx - pitch / 2, cy - pitch / 2, pitch, pitch);
    const image = discImage(bright ? this.look.color : this.look.background, disc, this.ratio);
    const w = disc * squeeze;
    ctx.drawImage(image, cx - w / 2, cy - disc / 2, w, disc);
  }

  /** One frame of a turn: redraw the discs turning now. Returns whether any are still to finish. */
  frame(now: number): boolean {
    const turn = this.turn;
    if (!turn) return false;
    this.ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    let remaining = false;
    for (let i = 0; i < DOTS; i++) {
      if (turn.done[i]) continue;
      const t = (now - turn.start - this.delay(i % DOT_COLUMNS)) / FLIP_MS;
      if (t < 0) {
        remaining = true; // the sweep has not reached it yet
        continue;
      }
      if (t >= 1) turn.done[i] = true;
      else remaining = true;
      this.paintDisc(i, now, true);
    }
    if (!remaining) {
      this.turn = null;
      // Drawn first before its board was scaled to fit (a screen does that just after), or
      // since resized: draw it again at the size it now appears.
      if (Math.abs(this.ratioOnScreen() - this.ratio) > 0.01) this.paintAll();
      this.onMoving(false);
    }
    return remaining;
  }

  /** Snap a turn under way to its end. */
  private finish(): void {
    this.turn = null;
    this.paintAll();
    this.onMoving(false);
  }
}

// --- Discs, drawn once and copied ---

const discs = new Map<string, HTMLCanvasElement>();

/**
 * A disc in `colour`, `size` CSS pixels across, at `ratio` canvas pixels per CSS pixel: a flat
 * disc with a soft shadow inside its lower edge, so it reads as a disc rather than a printed
 * circle (as the CSS version's inset shadow did). Made once for each colour and size.
 */
function discImage(colour: string, size: number, ratio: number): HTMLCanvasElement {
  const px = Math.max(1, Math.round(size * ratio));
  const key = `${colour}|${px}`;
  let image = discs.get(key);
  if (image) return image;
  image = document.createElement("canvas");
  image.width = px;
  image.height = px;
  const ctx = image.getContext("2d")!;
  const r = px / 2;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
  // The shadow: darkest at the bottom edge, clear by the middle, slightly lifted.
  const shade = ctx.createRadialGradient(r, r * 0.84, r * 0.55, r, r * 0.84, r * 1.16);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.save();
  ctx.clip();
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, px, px);
  ctx.restore();
  if (discs.size > 64) discs.clear();
  discs.set(key, image);
  return image;
}

// --- One loop for every character turning ---

const painters = new Set<FlipDotPainter>();
const turning = new Set<FlipDotPainter>();
let loop: number | null = null;

function animate(painter: FlipDotPainter): void {
  turning.add(painter);
  if (loop === null) loop = requestAnimationFrame(tick);
}

function tick(now: number): void {
  for (const painter of [...turning]) if (!painter.frame(now)) turning.delete(painter);
  loop = turning.size > 0 ? requestAnimationFrame(tick) : null;
}

// A window resized (a screen scaling its board to fit): draw every character at its new size.
if (typeof window !== "undefined") {
  // Once the window has stopped changing size, and the board has been scaled to fit it.
  let pending: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener("resize", () => {
    if (pending !== null) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      for (const painter of painters) painter.paintAll();
    }, 200);
  });
}

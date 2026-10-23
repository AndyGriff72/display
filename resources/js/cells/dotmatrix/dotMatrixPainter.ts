/**
 * Drawing dot-matrix characters on canvases.
 *
 * A board can have hundreds of dot-matrix characters of 35 dots each. Drawn as SVG, each with
 * its dots faded on and off inside a glow filter, a change had the browser re-layering thousands
 * of dots, and a cursor moving along a row stalled. So each character is one canvas, and each
 * kind of dot (unlit; lit with its glow; a VFD's square; a lightbulb and its filament) is drawn
 * once, at the size it appears, and copied into place (see dotImage). A VFD's wire mesh is drawn
 * once too, and laid over the top.
 *
 * LEDs and VFDs switch at once. Lightbulbs warm up and fade, as filaments do, by crossfading two
 * canvases (see DotMatrixPainter), the graphics card doing the fading.
 */

import type { Finish } from "../types";
import { DOT_COLUMNS, DOT_ROWS, dotGlyph } from "./font5x7";

const DOTS = DOT_COLUMNS * DOT_ROWS;

/** The drawing, in dot units: the dots' grid with a margin, as the SVG's viewBox was. */
const VIEW = { left: -0.15, top: -0.15, width: DOT_COLUMNS + 0.3, height: DOT_ROWS + 0.3 };

/** The padding inside the cell, as a share of its width (lit.css's 6%). */
const PADDING = 0.06;

/** How far a glow reaches past a dot, in dot units: the drawing reaches this far past the cell. */
const BLEED = 1.2;

interface Look {
  /** Glow blur (standard deviation), in dot units, and how many layers of it (more is brighter). */
  blur: number;
  layers: number;
  /** How bright unlit dots are, as a share of the lit colour (LED, VFD). */
  unlit: number;
}

const LOOKS: Record<Finish, Look> = {
  led: { blur: 0.22, layers: 2, unlit: 0.09 },
  vfd: { blur: 0.38, layers: 2, unlit: 0.13 },
  bulb: { blur: 0.5, layers: 2, unlit: 0 },
};

/** Lightbulbs: how long a filament takes to warm up and to cool down, in milliseconds. */
// (Warming up is left to the eye: a new character shows at once under the old one cooling down.)
const BULB_OFF_MS = 350;

export interface DotMatrixLook {
  width: number;
  height: number;
  color: string;
  finish: Finish;
}

/**
 * A dot-matrix cell's canvas: its size and where the dots go on it, in CSS pixels. The dots'
 * grid is fitted in the cell's padded inside, as the SVG did, and the canvas reaches `bleed`
 * past the cell all round, for the glow.
 */
export function dotMatrixGeometry(width: number, height: number) {
  const pad = width * PADDING;
  const inner = { w: width - 2 * pad, h: height - 2 * pad };
  const unit = Math.min(inner.w / VIEW.width, inner.h / VIEW.height);
  const bleed = BLEED * unit;
  // The grid's top left, within the canvas (which starts `bleed` outside the cell).
  const left = bleed + pad + (inner.w - VIEW.width * unit) / 2 - VIEW.left * unit;
  const top = bleed + pad + (inner.h - VIEW.height * unit) / 2 - VIEW.top * unit;
  return { width: width + 2 * bleed, height: height + 2 * bleed, bleed, unit, left, top };
}

/**
 * One dot-matrix character's canvases. LEDs and VFDs use one, redrawn for each character. Bulbs
 * use two: a new character is drawn once on the canvas behind, which then fades in over the old
 * one (BULB_ON_MS) while the old fades out (BULB_OFF_MS), so filaments warm up and cool down with
 * the graphics card doing the fading. Nothing is redrawn frame by frame.
 */
export class DotMatrixPainter {
  private look: DotMatrixLook;
  private lit: boolean[] = Array<boolean>(DOTS).fill(false);
  private ratio = 0;
  /** Which canvas is in front (showing the current character). */
  private front = 0;
  private fades: Animation[] = [];
  /**
   * Each canvas's fade: from and to which opacity, starting when, for how long. Kept here rather
   * than read back from the browser, which would make it work out the whole page's styles each
   * time (and a row of bulbs fades all at once).
   */
  private fading = [
    { from: 1, to: 1, start: 0, ms: 1 },
    { from: 0, to: 0, start: 0, ms: 1 },
  ];

  constructor(
    private readonly canvases: [HTMLCanvasElement, HTMLCanvasElement],
    look: DotMatrixLook
  ) {
    this.look = look;
    painters.add(this);
    // A screen scales its board to fit just after the cells are made: once that has happened,
    // draw again if the cell now appears at a different size.
    requestAnimationFrame(() => {
      if (painters.has(this) && Math.abs(this.ratioOnScreen() - this.ratio) > 0.01) this.paint(true);
    });
  }

  /** Show `char` (and draw everything again if the look has changed); bulbs fade, unless not to. */
  show(char: string, look: DotMatrixLook, fade = true): void {
    const changedLook = look.width !== this.look.width || look.height !== this.look.height || look.color !== this.look.color || look.finish !== this.look.finish;
    this.look = look;
    this.lit = dotGlyph(char).flatMap((row) => [...row].map((d) => d === "#"));
    if (fade && look.finish === "bulb" && !changedLook && this.ratio !== 0 && typeof document !== "undefined" && !document.hidden) {
      this.crossfade();
      return;
    }
    this.paint(changedLook || this.ratio === 0);
  }

  dispose(): void {
    painters.delete(this);
    this.fades.forEach((a) => a.cancel());
  }

  /** Canvas pixels per CSS pixel, for the size the cell appears on screen now. */
  private ratioOnScreen(): number {
    const shown = this.canvases[this.front].getBoundingClientRect();
    const { width } = dotMatrixGeometry(this.look.width, this.look.height);
    const onScreen = shown.width > 0 ? shown.width / width : 1;
    return Math.min(8, Math.max(1, (window.devicePixelRatio || 1) * onScreen));
  }

  /**
   * Draw the character as it stands on the front canvas, the other hidden. With `resize`, first
   * fit the canvases to the size the cell appears at (measuring it makes the browser lay the page
   * out, so not on every change).
   */
  paint(resize = false): void {
    this.fades.forEach((a) => a.cancel());
    this.fades = [];
    this.draw(this.canvases[this.front], resize);
    this.canvases[this.front].style.opacity = "1";
    this.canvases[this.front].style.zIndex = "2";
    this.canvases[1 - this.front].style.opacity = "0";
    this.canvases[1 - this.front].style.zIndex = "1";
    this.fading[this.front] = { from: 1, to: 1, start: 0, ms: 1 };
    this.fading[1 - this.front] = { from: 0, to: 0, start: 0, ms: 1 };
  }

  /**
   * Bulbs: the new character drawn on the other canvas, shown at once underneath, and the old
   * one laid over it, cooling down (fading out). One fade per change, however fast characters
   * come, which matters when a whole row of bulbs changes at once.
   */
  private crossfade(): void {
    const old = this.canvases[this.front];
    this.front = 1 - this.front;
    const fresh = this.canvases[this.front];
    this.draw(fresh, false);
    this.fades.forEach((a) => a.cancel());
    const now = performance.now();
    const f = this.fading[1 - this.front];
    const fromOld = f.from + (f.to - f.from) * Math.min(1, Math.max(0, (now - f.start) / f.ms));
    fresh.style.opacity = "1";
    fresh.style.zIndex = "1";
    old.style.zIndex = "2";
    this.fading[this.front] = { from: 1, to: 1, start: now, ms: 1 };
    this.fading[1 - this.front] = { from: fromOld, to: 0, start: now, ms: BULB_OFF_MS };
    this.fades = [old.animate([{ opacity: fromOld }, { opacity: 0 }], { duration: BULB_OFF_MS, easing: "ease-out", fill: "forwards" })];
  }

  private draw(canvas: HTMLCanvasElement, resize: boolean): void {
    const g = dotMatrixGeometry(this.look.width, this.look.height);
    if (resize || this.ratio === 0) {
      const ratio = this.ratioOnScreen();
      if (Math.abs(ratio - this.ratio) > 0.01) this.ratio = ratio;
    }
    for (const c of this.canvases) {
      if (c.width !== Math.round(g.width * this.ratio)) {
        c.width = Math.round(g.width * this.ratio);
        c.height = Math.round(g.height * this.ratio);
      }
    }
    const { color, finish } = this.look;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.clearRect(0, 0, g.width, g.height);
    const off = dotImage(finish, color, "off", g.unit, this.ratio);
    const on = dotImage(finish, color, "on", g.unit, this.ratio);
    const size = on.width / this.ratio;
    const half = size / 2;
    for (let i = 0; i < DOTS; i++) {
      const cx = g.left + ((i % DOT_COLUMNS) + 0.5) * g.unit;
      const cy = g.top + (Math.floor(i / DOT_COLUMNS) + 0.5) * g.unit;
      ctx.drawImage(this.lit[i] ? on : off, cx - half, cy - half, size, size);
    }
    if (finish === "vfd") {
      const mesh = meshImage(g.unit, this.ratio, Math.ceil(g.width), Math.ceil(g.height));
      ctx.drawImage(mesh, 0, 0, mesh.width / this.ratio, mesh.height / this.ratio);
    }
  }
}

// --- Dots, drawn once and copied ---

const images = new Map<string, HTMLCanvasElement>();

/**
 * One dot, lit or not, drawn at `unit` CSS pixels per dot unit and `ratio` canvas pixels per CSS
 * pixel, centred in a square big enough for its glow (BLEED all round).
 */
function dotImage(finish: Finish, color: string, state: "on" | "off", unit: number, ratio: number): HTMLCanvasElement {
  const px = unit * ratio;
  const span = 1 + 2 * BLEED;
  const size = Math.max(2, Math.ceil(span * px));
  const key = `${finish}|${color}|${state}|${size}`;
  let image = images.get(key);
  if (image) return image;
  image = document.createElement("canvas");
  image.width = size;
  image.height = size;
  const ctx = image.getContext("2d")!;
  const c = size / 2;
  const look = LOOKS[finish];
  const shape = () => {
    ctx.beginPath();
    if (finish === "vfd") {
      const s = 0.76 * px;
      ctx.roundRect(c - s / 2, c - s / 2, s, s, 0.14 * px);
    } else {
      ctx.arc(c, c, (finish === "bulb" ? 0.43 : 0.4) * px, 0, Math.PI * 2);
    }
  };

  if (state === "off") {
    if (finish === "bulb") {
      // Unlit bulbs are glass catching a little light.
      shape();
      ctx.fillStyle = "#2a2622";
      ctx.fill();
      ctx.lineWidth = 0.04 * px;
      ctx.strokeStyle = "#3a352e";
      ctx.stroke();
    } else {
      ctx.globalAlpha = look.unlit;
      shape();
      ctx.fillStyle = color;
      ctx.fill();
    }
  } else {
    // The glow: the dot drawn blurred, `layers` times over (stacking keeps the colour's hue,
    // where adding light would push amber to yellow), then the dot itself on top.
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = look.blur * 2 * px;
    for (let i = 0; i < look.layers; i++) {
      shape();
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    shape();
    ctx.fill();
    if (finish === "bulb") {
      // A bulb's filament: a hot, near-white centre.
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(c, c, 0.17 * px, 0, Math.PI * 2);
      ctx.fillStyle = "#fff6dc";
      ctx.fill();
    }
  }
  if (images.size > 200) images.clear();
  images.set(key, image);
  return image;
}

/** A VFD's wire mesh over a whole canvas of `width` x `height` CSS pixels, drawn once per size. */
function meshImage(unit: number, ratio: number, width: number, height: number): HTMLCanvasElement {
  const key = `mesh|${unit.toFixed(3)}|${ratio.toFixed(3)}|${width}|${height}`;
  let image = images.get(key);
  if (image) return image;
  image = document.createElement("canvas");
  image.width = Math.ceil(width * ratio);
  image.height = Math.ceil(height * ratio);
  const ctx = image.getContext("2d")!;
  const pitch = 0.25 * unit * ratio;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
  ctx.lineWidth = Math.max(0.5, 0.035 * unit * ratio);
  ctx.beginPath();
  for (let x = 0; x <= image.width; x += pitch) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, image.height);
  }
  for (let y = 0; y <= image.height; y += pitch) {
    ctx.moveTo(0, y);
    ctx.lineTo(image.width, y);
  }
  ctx.stroke();
  images.set(key, image);
  return image;
}

const painters = new Set<DotMatrixPainter>();

// A window resized (a screen scaling its board to fit): draw every character at its new size.
if (typeof window !== "undefined") {
  let pending: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener("resize", () => {
    if (pending !== null) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      for (const painter of painters) painter.paint(true);
    }, 200);
  });
}

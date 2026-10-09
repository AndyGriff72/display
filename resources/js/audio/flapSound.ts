/**
 * The sound a flap makes when it lands. One shared player for the whole board: a board of
 * a few hundred cells can land thousands of flaps a second, and playing every one of them
 * would be both deafening and expensive, so landings closer together than MIN_GAP_MS are
 * dropped. What is left still reads as the clatter of a whole board settling.
 *
 * The default is a recording of a real mechanism (resources/wav/split-flap.wav). The
 * synthesised styles in clickSynth.ts remain as alternatives.
 */

import recordingUrl from "../../wav/split-flap.wav?url";
import { SYNTH_STYLE_LABELS, SYNTH_STYLES, synthesiseClickSamples, type SynthStyle } from "./clickSynth";

/** Every sound a board can choose: the recording first, then the synthesised ones. */
export const SOUND_STYLES = ["recorded", ...SYNTH_STYLES] as const;
export type SoundStyle = (typeof SOUND_STYLES)[number];

export const SOUND_STYLE_LABELS: Record<SoundStyle, string> = {
  recorded: "Real mechanism",
  ...SYNTH_STYLE_LABELS,
};

export const DEFAULT_SOUND_STYLE: SoundStyle = "recorded";

const MIN_GAP_MS = 50;
const VARIANTS = 8;

/** Playback speed for synthesised flaps (tuned by ear), with a little variation each time. */
const SYNTH_RATE = { from: 1.52, spread: 0.16 };

/**
 * Playback speed for the recording: its own, give or take a little, so no two flaps sound
 * quite alike without the pitch moving away from the real thing.
 */
const RECORDED_RATE = { from: 0.94, spread: 0.12 };

/** The level every sound is brought to, so the volume setting means the same for each style. */
const PEAK = 0.9;

class FlapSound {
  private ctx: AudioContext | null = null;
  private output: GainNode | null = null;
  private synthesised: AudioBuffer[] = [];
  private recording: AudioBuffer | null = null;
  private recordingLoad: Promise<void> | null = null;
  private lastPlayed = 0;
  private enabled = false;
  private volume = 0.5;
  private style: SoundStyle = DEFAULT_SOUND_STYLE;
  private listeners = new Set<() => void>();

  /**
   * Whether the sound is on but the browser is holding it back, as browsers do on a page nobody
   * has clicked, tapped or typed on yet. It starts by itself at the first of those.
   */
  get heldBack(): boolean {
    return this.enabled && this.ctx !== null && this.ctx.state !== "running";
  }

  /** Be told when heldBack may have changed. Returns a function that stops telling. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  /**
   * Turn the sound on, starting it now if the browser allows.
   *
   * Browsers hold sound back on a page nobody has clicked, tapped or typed on yet, unless they
   * have been told to allow it for the site (or, for a screen, started with the autoplay policy
   * relaxed). When held back, it starts by itself at the first click, tap or key press, with
   * nothing for anyone to do or see.
   */
  enable(): void {
    const ctx = this.context();
    this.enabled = true;
    ctx.resume().catch(() => {});
    if (ctx.state !== "running") this.resumeOnFirstInteraction();
    this.notify();
  }

  /** Which sound flaps make: the recording, or a synthesised style (see clickSynth.ts). */
  setStyle(style: SoundStyle): void {
    if (style === this.style) return;
    this.style = style;
    if (this.ctx) this.prepare(this.ctx);
  }

  /**
   * A short ripple of flaps in the current style and volume, whether or not the sound is on:
   * for choosing a style by ear. Call it from a click, so the browser lets it play.
   */
  audition(): void {
    const ctx = this.context();
    ctx.resume().catch(() => {});
    // The recording may still be on its way the very first time: wait for it, then play.
    const ready = this.style === "recorded" ? this.loadRecording(ctx) : Promise.resolve();
    ready.then(() => {
      const start = ctx.currentTime + 0.05;
      for (let i = 0; i < 14; i++) {
        // Quick at first, slowing as the board settles, as a real run of flaps does.
        const at = start + i * 0.035 + i * i * 0.0015 + Math.random() * 0.008;
        this.voice(ctx, at);
      }
    });
  }

  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.ctx.onstatechange = () => this.notify();
      this.output = this.ctx.createGain();
      this.output.gain.value = this.volume;
      this.output.connect(this.ctx.destination);
      this.prepare(this.ctx);
    }
    return this.ctx;
  }

  /** Have the current style's sound ready to play. */
  private prepare(ctx: AudioContext): void {
    if (this.style === "recorded") {
      this.loadRecording(ctx);
    } else {
      const style = this.style as SynthStyle;
      this.synthesised = Array.from({ length: VARIANTS }, () => synthesiseClick(ctx, style));
    }
  }

  /** Fetch and decode the recording, once, levelled to the same peak as the synthesised sounds. */
  private loadRecording(ctx: AudioContext): Promise<void> {
    this.recordingLoad ??= fetch(recordingUrl)
      .then((response) => response.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        this.recording = levelled(buffer);
      })
      .catch(() => {
        // Without the recording, fall back to a synthesised slap rather than silence.
        this.recordingLoad = null;
        this.synthesised = Array.from({ length: VARIANTS }, () => synthesiseClick(ctx, "slap"));
      });
    return this.recordingLoad;
  }

  private voice(ctx: AudioContext, at?: number): void {
    const recorded = this.style === "recorded" && this.recording !== null;
    const buffer = recorded ? this.recording : this.synthesised[Math.floor(Math.random() * this.synthesised.length)];
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // No two flaps sound quite the same.
    const rate = recorded ? RECORDED_RATE : SYNTH_RATE;
    source.playbackRate.value = rate.from + Math.random() * rate.spread;
    // Nor land quite as hard: a recording played identically every time sounds like one.
    const level = ctx.createGain();
    level.gain.value = recorded ? 0.8 + Math.random() * 0.2 : 1;
    source.connect(level).connect(this.output!);
    source.start(at);
  }

  private waitingForInteraction = false;

  private resumeOnFirstInteraction(): void {
    if (this.waitingForInteraction) return;
    this.waitingForInteraction = true;
    const resume = () => {
      this.ctx?.resume().catch(() => {});
      window.removeEventListener("pointerdown", resume, true);
      window.removeEventListener("keydown", resume, true);
      this.waitingForInteraction = false;
    };
    window.addEventListener("pointerdown", resume, true);
    window.addEventListener("keydown", resume, true);
  }

  disable(): void {
    this.enabled = false;
    this.notify();
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.output) this.output.gain.value = volume;
  }

  play(): void {
    const ctx = this.ctx;
    if (!this.enabled || !ctx || !this.output || ctx.state !== "running") return;

    const now = performance.now();
    // A little jitter on the gap so a busy board does not settle into a steady buzz.
    if (now - this.lastPlayed < MIN_GAP_MS * (0.6 + Math.random() * 0.8)) return;
    this.lastPlayed = now;

    this.voice(ctx);
  }
}

/** One variant of a synthesised click (see clickSynth.ts), ready to play. */
function synthesiseClick(ctx: AudioContext, style: SynthStyle): AudioBuffer {
  const samples = synthesiseClickSamples(ctx.sampleRate, Math.random, style);
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}

/** A buffer scaled, every channel alike, so its loudest moment reaches PEAK. */
function levelled(buffer: AudioBuffer): AudioBuffer {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    for (const v of buffer.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  }
  if (peak > 0) {
    const scale = PEAK / peak;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) data[i] *= scale;
    }
  }
  return buffer;
}

export const flapSound = new FlapSound();

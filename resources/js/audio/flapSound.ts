/**
 * The sound a flap makes when it lands. One shared player for the whole board.
 *
 * Flaps usually fall together on the board's beat (see FlapClock), and each beat is one sound,
 * fuller the more flaps land on it (see beat). When flaps keep their own time instead, a board
 * of a few hundred cells can land thousands a second, and playing every one would be both
 * deafening and expensive, so landings closer together than MIN_GAP_MS are dropped (see play).
 *
 * The default is a recording of a real mechanism (resources/wav/split-flap.wav). The
 * synthesised styles in clickSynth.ts remain as alternatives.
 */

import recordingUrl from "../../wav/split-flap.wav?url";
import { SYNTH_STYLE_LABELS, SYNTH_STYLES, synthesiseClickSamples, synthesiseDotTickSamples, type SynthStyle } from "./clickSynth";

/** Every sound a board can choose: the recording first, then the synthesised ones. */
export const SOUND_STYLES = ["recorded", ...SYNTH_STYLES] as const;
export type SoundStyle = (typeof SOUND_STYLES)[number];

export const SOUND_STYLE_LABELS: Record<SoundStyle, string> = {
  recorded: "Real mechanism",
  ...SYNTH_STYLE_LABELS,
};

export const DEFAULT_SOUND_STYLE: SoundStyle = "recorded";

const MIN_GAP_MS = 50;

/** Closest two flip-dot ticks may be, in milliseconds: closer ones merge into the rattle. */
const DOT_GAP_MS = 8;
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
  private dotTicks: AudioBuffer[] = [];
  /** Moments (in DOT_GAP_MS steps) a flip-dot tick is already booked for. */
  private dotSlots = new Set<number>();

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
      const ctx = this.ctx;
      this.dotTicks = Array.from({ length: VARIANTS }, () => {
        const samples = synthesiseDotTickSamples(ctx.sampleRate);
        const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
        buffer.getChannelData(0).set(samples);
        return buffer;
      });
      this.output = this.ctx.createGain();
      this.output.gain.value = this.volume;
      // A limiter, so the loudest beats (many flaps landing almost at once) never distort; it
      // leaves anything quieter alone.
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -4;
      limiter.knee.value = 4;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      this.output.connect(limiter).connect(this.ctx.destination);
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

  private voice(ctx: AudioContext, at?: number, gain = 1): void {
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
    level.gain.value = (recorded ? 0.8 + Math.random() * 0.2 : 1) * gain;
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

  /**
   * Flip-dot discs turning over: a tick for each column that turns, at its moment in the sweep
   * (delays in milliseconds from now). Ticks closer than DOT_GAP_MS to one already booked are
   * left out, so a whole board changing is a rattle across it rather than a roar.
   */
  dotFlips(delaysMs: number[]): void {
    const ctx = this.ctx;
    if (!this.enabled || !ctx || !this.output || ctx.state !== "running" || this.dotTicks.length === 0) return;

    const now = ctx.currentTime;
    if (this.dotSlots.size > 2000) {
      const past = Math.floor((now * 1000) / DOT_GAP_MS);
      for (const slot of this.dotSlots) if (slot < past) this.dotSlots.delete(slot);
    }
    for (const delay of delaysMs) {
      const at = now + delay / 1000;
      const slot = Math.round((at * 1000) / DOT_GAP_MS);
      if (this.dotSlots.has(slot)) continue;
      this.dotSlots.add(slot);
      const source = ctx.createBufferSource();
      source.buffer = this.dotTicks[Math.floor(Math.random() * this.dotTicks.length)];
      source.playbackRate.value = 0.9 + Math.random() * 0.2;
      source.connect(this.output);
      source.start(at);
    }
  }

  /**
   * A beat of the board's clock (see FlapClock): the flaps that landed on it, played as a
   * scatter of flaps that is louder, denser and wider the more there are (see beatSound).
   * Beats are never dropped: they are what makes the rhythm.
   *
   * @param dueAt when the beat was due, in Date.now() time: its sound is played at exactly
   *   that moment plus BEAT_LATENCY, however late the browser ran the beat
   */
  beat(landed: number, dueAt = Date.now()): void {
    const ctx = this.ctx;
    if (!this.enabled || !ctx || !this.output || ctx.state !== "running") return;
    const { voices, gain, spreadMs } = beatSound(landed);
    const at = Math.max(ctx.currentTime, ctx.currentTime + BEAT_LATENCY + (dueAt - Date.now()) / 1000);
    for (const offset of beatOffsets(voices, spreadMs)) this.voice(ctx, at + offset / 1000, gain);
  }

  /** One flap landing, when flaps keep their own time. */
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

/**
 * How a beat of `landed` flaps sounds. Exported for the tests.
 *
 * Many flaps landing "together" are really many mechanisms landing within a few milliseconds
 * of each other, each a little different, so a beat is played as several flaps, scattered:
 * - loudness grows with the number of flaps, steeply enough that a lone flap is a light tick
 *   and a whole row a hard clack, reaching full at BEAT_FULL flaps;
 * - the number of flaps played grows too (about 1.6 per square root of those landing), up to
 *   BEAT_MAX_VOICES, so a big change sounds denser as well as louder, past full loudness;
 * - and they spread over a window that widens with the number, up to BEAT_MAX_SPREAD_MS.
 *
 * `gain` is for each flap played: together they make the beat's loudness, as sounds that do not
 * line up exactly add (by the square root of how many there are).
 */
export function beatSound(landed: number): { voices: number; gain: number; spreadMs: number } {
  if (landed <= 0) return { voices: 0, gain: 0, spreadMs: 0 };
  const loudness = Math.min(1, Math.pow(landed / BEAT_FULL, BEAT_DYNAMICS));
  const voices = Math.min(landed, BEAT_MAX_VOICES, Math.ceil(1.6 * Math.sqrt(landed)));
  const spreadMs = landed === 1 ? 0 : Math.min(BEAT_MAX_SPREAD_MS, 3 + 3.5 * Math.sqrt(landed));
  return { voices, gain: loudness / Math.sqrt(voices), spreadMs };
}

/**
 * When each flap of a beat plays, in milliseconds after the beat: the first on it, the rest
 * scattered through the spread, most of them close behind and a few stragglers later, as
 * mechanisms do. Exported for the tests.
 */
export function beatOffsets(voices: number, spreadMs: number, random: () => number = Math.random): number[] {
  return Array.from({ length: voices }, (_, i) => (i === 0 ? 0 : spreadMs * Math.pow(random(), 1.6))).sort((a, b) => a - b);
}

/** How many flaps landing on one beat sound as loud as a board can. */
const BEAT_FULL = 24;

/**
 * How steeply a beat's loudness rises with its flaps: 0 would make every beat the same, 1 make
 * loudness follow the count. At 0.45 a lone flap is about a quarter of full, six flaps half.
 */
const BEAT_DYNAMICS = 0.45;

/** The most flaps played for one beat. */
const BEAT_MAX_VOICES = 16;

/** The widest a beat's flaps spread, in milliseconds. */
const BEAT_MAX_SPREAD_MS = 25;

/**
 * How far behind its beat each beat's sound plays, in seconds: enough that a timer the browser
 * ran late can still be put back exactly on the beat, so the rhythm stays steady.
 */
const BEAT_LATENCY = 0.04;

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

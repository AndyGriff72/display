/**
 * The sound a flap makes when it lands. One shared player for the whole board.
 *
 * Flaps usually fall together on the board's beat (see FlapClock), and each beat is one sound,
 * fuller the more flaps land on it (see beat). When flaps keep their own time instead, a board
 * of a few hundred cells can land thousands a second, and playing every one would be both
 * deafening and expensive, so landings closer together than MIN_GAP_MS are dropped (see play).
 *
 * The default is recordings of a real display: separate flaps (public/sounds/flaps.wav), and
 * beats of many flaps falling together (public/sounds/clatter.wav), both prepared from the
 * recordings in resources/wav by scripts/prepare-flap-sounds.py. A beat is made of the separate
 * flaps, with the real clatter blended in the more flaps land together (see premixBeats). The
 * synthesised styles in clickSynth.ts remain as alternatives.
 */

import { SYNTH_STYLE_LABELS, SYNTH_STYLES, synthesiseClickSamples, synthesiseDotTickSamples, type SynthStyle } from "./clickSynth";

/** Every sound a board can choose: the recordings first, then the synthesised ones. */
export const SOUND_STYLES = ["recorded", ...SYNTH_STYLES] as const;
export type SoundStyle = (typeof SOUND_STYLES)[number];

export const SOUND_STYLE_LABELS: Record<SoundStyle, string> = {
  recorded: "Real mechanism",
  ...SYNTH_STYLE_LABELS,
};

export const DEFAULT_SOUND_STYLE: SoundStyle = "recorded";

const MIN_GAP_MS = 50;

/**
 * The clicks of flip-dot discs snapping over, as a sign sweeps across: when each is heard, in
 * milliseconds from now, and how loud. Exported for the tests.
 *
 * Each column that turns is a few discs snapping, so one to three clicks, a few milliseconds
 * apart, as the discs land (DOT_LAND_MS after their column starts to turn). The sweep moves a
 * column every few milliseconds, and clicks at exactly that spacing are heard not as clicks but
 * as a low buzz (at 7 ms apart, a tone of about 140 Hz): so every click is moved a little at
 * random, and the sweep is a dry rattle, as real signs' is.
 */
export function dotTickTimes(delaysMs: number[], random: () => number = Math.random): { at: number; gain: number }[] {
  const ticks: { at: number; gain: number }[] = [];
  for (const delay of delaysMs) {
    const clicks = 1 + (random() < 0.55 ? 1 : 0) + (random() < 0.2 ? 1 : 0);
    for (let k = 0; k < clicks; k++) {
      ticks.push({ at: delay + DOT_LAND_MS + (random() * 2 - 1) * DOT_JITTER_MS + k * (1 + random() * 3), gain: 0.45 + random() * 0.55 });
    }
  }
  return ticks.sort((a, b) => a.at - b.at);
}

/** When a disc is heard snapping into place, after its column starts to turn (FLIP_MS is 140). */
const DOT_LAND_MS = 120;

/** How far each click is moved at random, either way, to keep the sweep from buzzing. */
const DOT_JITTER_MS = 3.5;

/** Closest two flip-dot clicks may be, in milliseconds: closer ones merge into the rattle. */
const DOT_GAP_MS = 2.5;

/** Booked clicks are filed by time in steps this long (ms), to find near ones quickly. */
const DOT_BUCKET_MS = 0.5;
const VARIANTS = 8;

/** Playback speed for synthesised flaps (tuned by ear), with a little variation each time. */
const SYNTH_RATE = { from: 1.52, spread: 0.16 };

/**
 * Playback speed for the recordings: their own, give or take a very little. With several real
 * flaps to choose from, little variation is needed for no two to sound alike.
 */
const RECORDED_RATE = { from: 0.97, spread: 0.06 };

/**
 * The loudest a beat's sound may peak (full scale is 1, before the volume setting). Busy beats
 * are dense, so they sound louder than their peak suggests, and each overlaps the next (a beat's
 * sound outlasts the beat), so they are held well below full scale. A beat of a few flaps peaks
 * far lower than this and is not affected.
 */
const BEAT_PEAK_MOST = 0.2;

/** The prepared recordings (see scripts/prepare-flap-sounds.py), served as they are. */
const FLAPS_URL = "/sounds/flaps.wav";
const CLATTER_URL = "/sounds/clatter.wav";

/** Each flap or beat in those files sits in a slot this long: SLOT_MS in the script. */
const SOUND_SLOT_MS = 150;

/**
 * How much of a beat is the real clatter of many flaps rather than separate flaps: none for a
 * beat of four flaps or fewer, rising to this much for the busiest beats.
 */
const CLATTER_MOST = 0.7;

/** The level every sound is brought to, so the volume setting means the same for each style. */
const PEAK = 0.9;

class FlapSound {
  private ctx: AudioContext | null = null;
  private output: GainNode | null = null;
  private synthesised: AudioBuffer[] = [];
  /** Separate real flaps, and beats of many flaps together (see the file comment). */
  private flaps: AudioBuffer[] = [];
  private clatter: AudioBuffer[] = [];
  private recordingLoad: Promise<void> | null = null;
  private lastPlayed = 0;
  private enabled = false;
  private volume = 0.5;
  private style: SoundStyle = DEFAULT_SOUND_STYLE;
  private listeners = new Set<() => void>();
  private dotTicks: AudioBuffer[] = [];
  /** When flip-dot clicks are booked for (audio clock, in DOT_BUCKET_MS steps), so clicks too close together are left out. */
  private dotBooked = new Set<number>();
  /**
   * Beats mixed in advance (see premixBeats), by how many flaps each holds (BEAT_TIERS), a few
   * of each; empty until they are ready, when beats are mixed as they play instead.
   */
  private premixed = new Map<number, { buffer: AudioBuffer; peak: number }[]>();
  /** Counts the times the flap sound changed, so a mix started for an old one is thrown away. */
  private soundVersion = 0;

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

  /** Which sound flaps make: the recordings, or a synthesised style (see clickSynth.ts). */
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
    // The recordings may still be on their way the very first time: wait for them, then play.
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
    this.premixed = new Map();
    const version = ++this.soundVersion;
    if (this.style === "recorded") {
      this.loadRecording(ctx).then(() => this.premixBeats(ctx, version));
    } else {
      const style = this.style as SynthStyle;
      this.synthesised = Array.from({ length: VARIANTS }, () => synthesiseClick(ctx, style));
      this.premixBeats(ctx, version);
    }
  }

  /**
   * Mix, in advance, the beats a board plays: for each size in BEAT_TIERS, a few versions of
   * that many flaps scattered as beatOffsets scatters them, each flap a little different in
   * pitch and strength, exactly as beats used to be mixed while they played. A beat then plays
   * one ready-made sound at its loudness instead of building up to 16 flaps on the spot, so it
   * costs the page almost nothing.
   *
   * Mixed off to one side (an OfflineAudioContext), faster than real time, once per sound.
   */
  private async premixBeats(ctx: AudioContext, version: number): Promise<void> {
    const recorded = this.style === "recorded" && this.flaps.length > 0;
    const sources = recorded ? this.flaps : this.synthesised;
    if (sources.length === 0) return;
    const rate = recorded ? RECORDED_RATE : SYNTH_RATE;
    const mixed = new Map<number, { buffer: AudioBuffer; peak: number }[]>();
    try {
      for (const flaps of BEAT_TIERS) {
        const { spreadMs } = beatSound(tierLanded(flaps));
        const versions: { buffer: AudioBuffer; peak: number }[] = [];
        for (let v = 0; v < PREMIXED_VERSIONS; v++) {
          // A busy beat is partly the real sound of many flaps falling together.
          const clatter = recorded && this.clatter.length > 0 ? clatterShare(flaps) : 0;
          const voices = beatOffsets(flaps, spreadMs).map((offset) => ({
            buffer: sources[Math.floor(Math.random() * sources.length)],
            at: offset / 1000,
            rate: rate.from + Math.random() * rate.spread,
            // The flaps share the beat's loudness, as sounds that do not line up exactly add.
            gain: ((recorded ? 0.8 + Math.random() * 0.2 : 1) * (1 - clatter / 2)) / Math.sqrt(flaps),
          }));
          if (clatter > 0) {
            voices.push({
              buffer: this.clatter[Math.floor(Math.random() * this.clatter.length)],
              at: 0,
              rate: 0.98 + Math.random() * 0.04,
              gain: clatter,
            });
          }
          const seconds = Math.max(...voices.map((x) => x.at + x.buffer.duration / x.rate));
          const channels = Math.max(...voices.map((x) => x.buffer.numberOfChannels));
          const offline = new OfflineAudioContext(channels, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
          for (const x of voices) {
            const source = offline.createBufferSource();
            source.buffer = x.buffer;
            source.playbackRate.value = x.rate;
            const level = offline.createGain();
            level.gain.value = x.gain;
            source.connect(level).connect(offline.destination);
            source.start(x.at);
          }
          const buffer = await offline.startRendering();
          versions.push({ buffer, peak: peakOf(buffer) });
        }
        mixed.set(flaps, versions);
      }
    } catch {
      // Without them, beats are mixed as they play: as before, just costlier.
      return;
    }
    if (version === this.soundVersion) this.premixed = mixed;
  }

  /**
   * Fetch and decode the recordings, once, cut into their separate flaps and beats (one per
   * SOUND_SLOT_MS slot), each levelled to the same peak as the synthesised sounds.
   */
  private loadRecording(ctx: AudioContext): Promise<void> {
    const load = (url: string) =>
      fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`${url}: ${response.status}`);
          return response.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => slots(ctx, buffer, SOUND_SLOT_MS).map(levelled));
    this.recordingLoad ??= Promise.all([load(FLAPS_URL), load(CLATTER_URL)])
      .then(([flaps, clatter]) => {
        this.flaps = flaps;
        this.clatter = clatter;
      })
      .catch(() => {
        // Without the recordings, fall back to a synthesised slap rather than silence.
        this.recordingLoad = null;
        this.synthesised = Array.from({ length: VARIANTS }, () => synthesiseClick(ctx, "slap"));
      });
    return this.recordingLoad;
  }

  private voice(ctx: AudioContext, at?: number, gain = 1): void {
    const recorded = this.style === "recorded" && this.flaps.length > 0;
    const pool = recorded ? this.flaps : this.synthesised;
    const buffer = pool[Math.floor(Math.random() * pool.length)];
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
   * Flip-dot discs turning over: clicks for each column that turns (delays in milliseconds from
   * now, as the sweep reaches it), scattered as dotTickTimes says. Clicks within DOT_GAP_MS of
   * one already booked (many characters turn the same columns of the board at once) are left
   * out, so a whole board changing is a rattle across it rather than a roar.
   */
  dotFlips(delaysMs: number[]): void {
    const ctx = this.ctx;
    if (!this.enabled || !ctx || !this.output || ctx.state !== "running" || this.dotTicks.length === 0) return;

    const nowMs = ctx.currentTime * 1000;
    if (this.dotBooked.size > 4000) {
      const past = Math.floor(nowMs / DOT_BUCKET_MS);
      for (const bucket of this.dotBooked) if (bucket < past) this.dotBooked.delete(bucket);
    }
    const near = Math.ceil(DOT_GAP_MS / DOT_BUCKET_MS);
    for (const { at, gain } of dotTickTimes(delaysMs)) {
      const when = nowMs + at;
      const bucket = Math.round(when / DOT_BUCKET_MS);
      let taken = false;
      for (let b = bucket - near + 1; b < bucket + near && !taken; b++) taken = this.dotBooked.has(b);
      if (taken) continue;
      this.dotBooked.add(bucket);
      const source = ctx.createBufferSource();
      source.buffer = this.dotTicks[Math.floor(Math.random() * this.dotTicks.length)];
      source.playbackRate.value = 0.85 + Math.random() * 0.3;
      const level = ctx.createGain();
      level.gain.value = gain;
      source.connect(level).connect(this.output);
      source.start(when / 1000);
    }
  }

  /**
   * A beat of the board's clock (see FlapClock): the flaps that landed on it, played as a
   * scatter of flaps that is louder, denser and wider the more there are (see beatSound).
   * Beats are never dropped: they are what makes the rhythm.
   *
   * @param dueAt when the beat was due, in Date.now() time: its sound is played at exactly
   *   that moment plus BEAT_LATENCY, however late the browser ran the beat
   * @param ofTotal how many split-flaps the board has: all of them landing is full loudness
   */
  beat(landed: number, dueAt = Date.now(), ofTotal = landed): void {
    const ctx = this.ctx;
    if (!this.enabled || !ctx || !this.output || ctx.state !== "running") return;
    const { voices, gain, spreadMs } = beatSound(landed, ofTotal);
    const at = Math.max(ctx.currentTime, ctx.currentTime + BEAT_LATENCY + (dueAt - Date.now()) / 1000);
    const ready = this.premixed.get(beatTier(voices));
    if (ready) {
      // One ready-made beat of about this many flaps, at this beat's loudness, but never so loud
      // that its peak passes BEAT_PEAK_MOST: busy beats are dense, and overlap the next.
      const { buffer, peak } = ready[Math.floor(Math.random() * ready.length)];
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const level = ctx.createGain();
      level.gain.value = Math.min(gain * Math.sqrt(voices), BEAT_PEAK_MOST / Math.max(peak, 1e-6));
      source.connect(level).connect(this.output);
      source.start(at);
      return;
    }
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
 * - loudness grows with the share of the board's split-flaps landing, `ofTotal`: all of them is
 *   full, and every flap fewer is a little quieter, so a change dies away as its last tiles
 *   settle however big the board (a fixed count for full loudness would leave a big board at
 *   full almost to the end); a lone flap is a light tick;
 * - the number of flaps played grows too (about 1.6 per square root of those landing), up to
 *   BEAT_MAX_VOICES, so a big change sounds denser as well as louder, past full loudness;
 * - and they spread over a window that widens with the number, up to BEAT_MAX_SPREAD_MS.
 *
 * `gain` is for each flap played: together they make the beat's loudness, as sounds that do not
 * line up exactly add (by the square root of how many there are).
 */
export function beatSound(landed: number, ofTotal = landed): { voices: number; gain: number; spreadMs: number } {
  if (landed <= 0) return { voices: 0, gain: 0, spreadMs: 0 };
  const loudness = Math.min(1, Math.pow(landed / Math.max(1, ofTotal), BEAT_DYNAMICS));
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

/**
 * How steeply a beat's loudness rises with the share of the board landing: 0 would make every
 * beat the same, 1 make loudness follow the share. At 0.4, a fifth of the board landing is half
 * of full, and on a board of 180 split-flaps a lone flap is about an eighth.
 */
const BEAT_DYNAMICS = 0.4;

/** The most flaps played for one beat. */
const BEAT_MAX_VOICES = 16;

/**
 * The sizes of beat mixed in advance, in flaps (see premixBeats): every size up to four, where
 * one flap more is clearly heard, then wider steps up to BEAT_MAX_VOICES.
 */
export const BEAT_TIERS = [1, 2, 3, 4, 6, 8, 11, 16];

/** How many versions of each size are mixed, so that beats in a row do not sound identical. */
const PREMIXED_VERSIONS = 4;

/** The mixed-in-advance size nearest to a beat of `voices` flaps. Exported for the tests. */
export function beatTier(voices: number): number {
  return BEAT_TIERS.reduce((best, t) => (Math.abs(t - voices) < Math.abs(best - voices) ? t : best));
}

/** How many flaps landing make a beat of `flaps` flaps played (the inverse of beatSound's count). */
function tierLanded(flaps: number): number {
  return Math.max(1, Math.round((flaps / 1.6) ** 2));
}

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

/** How much of a beat of `flaps` flaps is the real clatter (see CLATTER_MOST). Exported for the tests. */
export function clatterShare(flaps: number): number {
  return Math.min(1, Math.max(0, (flaps - 4) / (BEAT_MAX_VOICES - 4))) * CLATTER_MOST;
}

/** A recording cut into its slots of `slotMs` each: separate flaps, or beats. */
function slots(ctx: AudioContext, buffer: AudioBuffer, slotMs: number): AudioBuffer[] {
  const length = Math.round((buffer.sampleRate * slotMs) / 1000);
  const count = Math.floor(buffer.length / length);
  return Array.from({ length: count }, (_, i) => {
    const slot = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
    for (let c = 0; c < buffer.numberOfChannels; c++) slot.getChannelData(c).set(buffer.getChannelData(c).subarray(i * length, (i + 1) * length));
    return slot;
  });
}

/** A buffer's loudest moment, across its channels. */
function peakOf(buffer: AudioBuffer): number {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) for (const v of buffer.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  return peak;
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

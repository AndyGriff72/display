/**
 * The click a flap makes when it lands. One shared player for the whole board: a board of
 * a few hundred cells can land thousands of flaps a second, and playing every one of them
 * would be both deafening and expensive, so landings closer together than MIN_GAP_MS are
 * dropped. What is left still reads as the clatter of a whole board settling.
 *
 * The default click is synthesised, so there is no third-party recording to license. A
 * recorded sample can be swapped in with useSample().
 */

const MIN_GAP_MS = 7;
const VARIANTS = 6;

class FlapSound {
  private ctx: AudioContext | null = null;
  private output: GainNode | null = null;
  private synthesised: AudioBuffer[] = [];
  private sample: AudioBuffer | null = null;
  private lastPlayed = 0;
  private enabled = false;
  private volume = 0.5;

  /**
   * Turn the sound on, starting it now if the browser allows.
   *
   * Browsers hold sound back on a page nobody has clicked, tapped or typed on yet, unless they
   * have been told to allow it for the site (or, for a screen, started with the autoplay policy
   * relaxed). When held back, it starts by itself at the first click, tap or key press, with
   * nothing for anyone to do or see.
   */
  enable(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.output = this.ctx.createGain();
      this.output.gain.value = this.volume;
      this.output.connect(this.ctx.destination);
      this.synthesised = Array.from({ length: VARIANTS }, () => synthesiseClick(this.ctx!));
    }
    this.enabled = true;
    this.ctx.resume().catch(() => {});
    if (this.ctx.state !== "running") this.resumeOnFirstInteraction();
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
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.output) this.output.gain.value = volume;
  }

  /** Play a recorded click instead of the synthesised one. Pass null to go back. */
  async useSample(url: string | null): Promise<void> {
    if (!url) {
      this.sample = null;
      return;
    }
    if (!this.ctx) throw new Error("Enable sound before loading a sample.");
    const response = await fetch(url);
    this.sample = await this.ctx.decodeAudioData(await response.arrayBuffer());
  }

  play(): void {
    const ctx = this.ctx;
    if (!this.enabled || !ctx || !this.output || ctx.state !== "running") return;

    const now = performance.now();
    // A little jitter on the gap so a busy board does not settle into a steady buzz.
    if (now - this.lastPlayed < MIN_GAP_MS * (0.6 + Math.random() * 0.8)) return;
    this.lastPlayed = now;

    const source = ctx.createBufferSource();
    source.buffer = this.sample ?? this.synthesised[Math.floor(Math.random() * this.synthesised.length)];
    // No two flaps sound quite the same.
    source.playbackRate.value = 0.92 + Math.random() * 0.16;
    source.connect(this.output);
    source.start();
  }
}

/**
 * A short plastic clack: a burst of filtered noise for the impact, a quickly-damped
 * resonance for the flap itself and a low thump from the housing.
 */
function synthesiseClick(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * 0.045);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);

  const ringHz = 1400 + Math.random() * 900;
  const thumpHz = 110 + Math.random() * 60;
  let smoothed = 0;

  for (let i = 0; i < length; i++) {
    const t = i / rate;
    // One-pole low-pass takes the hiss off the white noise.
    smoothed += 0.45 * (Math.random() * 2 - 1 - smoothed);
    const impact = smoothed * Math.exp(-t / 0.003);
    const ring = Math.sin(2 * Math.PI * ringHz * t) * Math.exp(-t / 0.005) * 0.35;
    const thump = Math.sin(2 * Math.PI * thumpHz * t) * Math.exp(-t / 0.012) * 0.4;
    data[i] = (impact + ring + thump) * 0.8;
  }
  return buffer;
}

export const flapSound = new FlapSound();

/**
 * The sound of one flap landing, made from scratch so there is no recording to license, in a
 * choice of styles. Kept free of the Web Audio API, which only fills a buffer with what this
 * returns, so each style can be measured in tests.
 */

export const SOUND_STYLES = ["slap", "click"] as const;
export type SoundStyle = (typeof SOUND_STYLES)[number];

export const SOUND_STYLE_LABELS: Record<SoundStyle, string> = {
  slap: "Slap",
  click: "Crisp click",
};

export function synthesiseClickSamples(
  rate: number,
  random: () => number = Math.random,
  style: SoundStyle = "slap"
): Float32Array {
  return normalise(style === "click" ? click(rate, random) : slap(rate, random));
}

/**
 * Thin flaps slapping down: noise rather than tones, so it has little pitch; most of it in a
 * fleshy band around 2–3 kHz, with a low-mid smack beneath and a crisp edge above; and two hits
 * a few milliseconds apart, the flap meeting the one below and then its stop ("fl-ap").
 */
function slap(rate: number, random: () => number): Float32Array {
  const data = new Float32Array(Math.floor(rate * 0.045));

  const second = 0.0025 + random() * 0.002; // seconds between the two hits
  const secondLevel = 0.45 + random() * 0.2;
  // Noise through a wider, higher band carries more energy, so the gains lean the other way to
  // keep the sound centred on the smack rather than the edge.
  const bands = [
    { filter: bandPass(rate, 650 + random() * 150, 1.1), tau: 0.0045, gain: 2.2 },
    { filter: bandPass(rate, 2200 + random() * 600, 1.4), tau: 0.0065, gain: 1.0 },
    { filter: bandPass(rate, 5200 + random() * 900, 0.8), tau: 0.0025, gain: 0.18 },
  ];

  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    const noise = random() * 2 - 1;
    let sample = 0;
    for (const band of bands) {
      const envelope = hit(t, 0, band.tau) + secondLevel * hit(t, second, band.tau);
      sample += band.filter(noise) * envelope * band.gain;
    }
    data[i] = sample;
  }
  return data;
}

/**
 * A sharper, more tonal click: a bright crack, two short plastic rings (3–4.5 and 6–7.5 kHz)
 * and a small rebound tick.
 */
function click(rate: number, random: () => number): Float32Array {
  const data = new Float32Array(Math.floor(rate * 0.03));

  const lowRing = 3000 + random() * 1500;
  const highRing = 6000 + random() * 1500;
  const body = 220 + random() * 80;
  const rebound = 0.004 + random() * 0.003;

  let previous = 0;
  let smoothed = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    const white = random() * 2 - 1;
    // Half plain noise, half its first difference (a high-pass), gently low-passed so the very
    // top does not sound like static.
    smoothed += 0.55 * (0.5 * white + 0.5 * (white - previous) - smoothed);
    previous = white;
    const bright = smoothed;

    const strike = bright * Math.exp(-t / 0.0011);
    const rings =
      Math.sin(2 * Math.PI * lowRing * t) * Math.exp(-t / 0.0025) * 0.5 +
      Math.sin(2 * Math.PI * highRing * t) * Math.exp(-t / 0.0014) * 0.35;
    const thud = Math.sin(2 * Math.PI * body * t) * Math.exp(-t / 0.003) * 0.12;
    const r = t - rebound;
    const settle =
      r >= 0
        ? (bright * Math.exp(-r / 0.0007) + Math.sin(2 * Math.PI * lowRing * 1.07 * r) * Math.exp(-r / 0.0015) * 0.4) * 0.35
        : 0;

    data[i] = strike + rings + thud + settle;
  }
  return data;
}

/** A hit starting at `start`: a 0.3 ms rise, then dying away with time constant `tau`. */
function hit(t: number, start: number, tau: number): number {
  const s = t - start;
  if (s < 0) return 0;
  return Math.min(1, s / 0.0003) * Math.exp(-s / tau);
}

/** A band-pass filter (the standard biquad), as a function fed one sample at a time. */
function bandPass(rate: number, centre: number, q: number): (x: number) => number {
  const w = (2 * Math.PI * centre) / rate;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

/** Peak at 0.9, so every variant is as loud as the others and none clips. */
function normalise(data: Float32Array): Float32Array {
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < data.length; i++) data[i] = (data[i] / peak) * 0.9;
  return data;
}

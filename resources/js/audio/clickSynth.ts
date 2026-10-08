/**
 * The sound of one flap landing, made from scratch so there is no recording to license.
 *
 * A split-flap board's clatter is sharp and slappy: thin plastic flaps snapping against a
 * stop. Most of the character is in the top end, so this is built from:
 *
 * - the crack of the strike: noise tilted towards the highs, with only the very top (which
 *   sounds like static) taken off, gone in a couple of milliseconds;
 * - the flap ringing as it hits: two plastic resonances, one around 3–4.5 kHz and one around
 *   6–7.5 kHz, both very quickly damped;
 * - a smaller rebound a few milliseconds later, as the flap settles against its stop;
 * - only a trace of low body, so it does not thud.
 *
 * Kept free of the Web Audio API, which only fills a buffer with what this returns, so the
 * sound can be measured in tests.
 */
export function synthesiseClickSamples(rate: number, random: () => number = Math.random): Float32Array {
  const length = Math.floor(rate * 0.03);
  const data = new Float32Array(length);

  const lowRing = 3000 + random() * 1500;
  const highRing = 6000 + random() * 1500;
  const body = 220 + random() * 80;
  const rebound = 0.004 + random() * 0.003; // seconds after the strike

  let previous = 0;
  let smoothed = 0;
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const white = random() * 2 - 1;
    // Half plain noise, half its first difference (a high-pass), for a crack with plenty of
    // top end; then a gentle low-pass takes off the very highest hiss, which sounds like
    // static rather than plastic.
    smoothed += 0.55 * (0.5 * white + 0.5 * (white - previous) - smoothed);
    previous = white;
    const bright = smoothed;

    const strike = bright * Math.exp(-t / 0.0011);
    const rings =
      Math.sin(2 * Math.PI * lowRing * t) * Math.exp(-t / 0.0025) * 0.5 +
      Math.sin(2 * Math.PI * highRing * t) * Math.exp(-t / 0.0014) * 0.35;
    const thud = Math.sin(2 * Math.PI * body * t) * Math.exp(-t / 0.003) * 0.12;

    const r = t - rebound;
    const settle = r >= 0 ? (bright * Math.exp(-r / 0.0007) + Math.sin(2 * Math.PI * lowRing * 1.07 * r) * Math.exp(-r / 0.0015) * 0.4) * 0.35 : 0;

    data[i] = strike + rings + thud + settle;
  }

  // Peak at 0.9, so every variant is as loud as the others and none clips.
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < length; i++) data[i] = (data[i] / peak) * 0.9;

  return data;
}

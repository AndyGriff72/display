/**
 * Text made fit for character cells (split-flap, dot matrix, segments, flip-dot), which can only
 * show what is on their flaps or in their font: typographers' punctuation as the plain kind
 * (‘ ’ “ ” – — … as ' " - .), and accented letters without their accents (é as e, Ø as O). News
 * feeds are full of both, and without this they show as blanks.
 *
 * Every character stays one character, so text keeps its length and lines up as it did. Text
 * areas show the original: their fonts have it all.
 */

const PUNCTUATION: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'", "´": "'", "`": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"', "″": '"', "«": '"', "»": '"',
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-", "−": "-",
  "…": ".", "•": ".", "·": ".",
  " ": " ", " ": " ", " ": " ", " ": " ", " ": " ", "\t": " ",
  "×": "X", "ß": "S", "Æ": "A", "æ": "A", "Œ": "O", "œ": "O",
  "Ø": "O", "ø": "O", "Ł": "L", "ł": "L", "Đ": "D", "đ": "D", "Ð": "D", "ð": "D",
  "Þ": "T", "þ": "T", "ı": "I",
};

/** One character as plain as it can be while staying one character. */
export function plainChar(ch: string): string {
  const mapped = PUNCTUATION[ch];
  if (mapped !== undefined) return mapped;
  if (ch.charCodeAt(0) < 0x80) return ch;
  // Accents come off: the letter decomposed, its marks dropped.
  const bare = ch.normalize("NFD").replace(/\p{M}/gu, "");
  return bare.length === 1 ? bare : ch;
}

/**
 * A whole text made plain, one character for each it had. Characters made of two halves (most
 * emoji) become a single blank, since no character cell has them.
 */
export function plainText(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) out += ch.length > 1 ? " " : plainChar(ch);
  return out;
}

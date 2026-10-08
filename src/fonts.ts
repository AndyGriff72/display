/**
 * Typefaces offered for the glyphs. The Google ones are all under the SIL Open Font
 * Licence, so they are free to use and to bundle later if the board needs to run offline.
 */
export interface FontOption {
  id: string;
  label: string;
  /** CSS font-family value. */
  family: string;
  /** Google Fonts family spec to load, if it is not a system font. */
  google?: string;
}

export const FONTS: FontOption[] = [
  { id: "helvetica", label: "Helvetica / Arial (system)", family: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id: "roboto-condensed", label: "Roboto Condensed", family: '"Roboto Condensed", sans-serif', google: "Roboto+Condensed:wght@500" },
  { id: "barlow-condensed", label: "Barlow Condensed", family: '"Barlow Condensed", sans-serif', google: "Barlow+Condensed:wght@500" },
  { id: "oswald", label: "Oswald", family: '"Oswald", sans-serif', google: "Oswald:wght@500" },
  { id: "bebas-neue", label: "Bebas Neue", family: '"Bebas Neue", sans-serif', google: "Bebas+Neue" },
  { id: "share-tech-mono", label: "Share Tech Mono", family: '"Share Tech Mono", monospace', google: "Share+Tech+Mono" },
  { id: "ibm-plex-mono", label: "IBM Plex Mono", family: '"IBM Plex Mono", monospace', google: "IBM+Plex+Mono:wght@500" },
];

const loaded = new Set<string>();

/** Add the font's stylesheet to the page the first time it is chosen. */
export function loadFont(font: FontOption): void {
  if (!font.google || loaded.has(font.id)) return;
  loaded.add(font.id);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
  document.head.appendChild(link);
}

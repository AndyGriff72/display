/**
 * Typefaces offered for the glyphs. The Google ones are all under the SIL Open Font
 * Licence, so they are free to use and to bundle later if the board needs to run offline.
 * Bedstead is bundled already (resources/fonts), being in the public domain.
 *
 * Each loads its bold and italic too, where the face has them, so text set bold or italic uses
 * the designed letters rather than ones the browser thickens or slants itself.
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
  { id: "roboto-condensed", label: "Roboto Condensed", family: '"Roboto Condensed", sans-serif', google: "Roboto+Condensed:ital,wght@0,500;0,700;1,500;1,700" },
  { id: "barlow-condensed", label: "Barlow Condensed", family: '"Barlow Condensed", sans-serif', google: "Barlow+Condensed:ital,wght@0,500;0,700;1,500;1,700" },
  { id: "oswald", label: "Oswald", family: '"Oswald", sans-serif', google: "Oswald:wght@500;700" },
  { id: "bebas-neue", label: "Bebas Neue", family: '"Bebas Neue", sans-serif', google: "Bebas+Neue" },
  { id: "share-tech-mono", label: "Share Tech Mono", family: '"Share Tech Mono", monospace', google: "Share+Tech+Mono" },
  { id: "ibm-plex-mono", label: "IBM Plex Mono", family: '"IBM Plex Mono", monospace', google: "IBM+Plex+Mono:ital,wght@0,500;0,700;1,500;1,700" },
  // Plainer faces, for areas drawn as text.
  { id: "inter", label: "Inter", family: '"Inter", sans-serif', google: "Inter:ital,wght@0,400;0,600;0,700;1,400;1,700" },
  { id: "source-sans", label: "Source Sans 3", family: '"Source Sans 3", sans-serif', google: "Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400;1,700" },
  { id: "lato", label: "Lato", family: '"Lato", sans-serif', google: "Lato:ital,wght@0,400;0,700;1,400;1,700" },
  { id: "merriweather", label: "Merriweather (serif)", family: '"Merriweather", serif', google: "Merriweather:ital,wght@0,400;0,700;1,400;1,700" },
  // Bundled with the app rather than from Google Fonts: see Board.css and resources/fonts.
  { id: "bedstead", label: "Bedstead (Teletext)", family: '"Bedstead", monospace' },
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

import { describe, expect, it } from "vitest";
import { DOT_COLUMNS, DOT_FONT_CHARS, DOT_ROWS, dotGlyph } from "./font5x7";

describe("5 × 7 dot font", () => {
  it("has every glyph the right size and drawn only with dots and spaces", () => {
    for (const ch of DOT_FONT_CHARS) {
      const rows = dotGlyph(ch);
      expect(rows, ch).toHaveLength(DOT_ROWS);
      for (const row of rows) expect(row, ch).toMatch(new RegExp(`^[#.]{${DOT_COLUMNS}}$`));
    }
  });

  it("covers the standard flap stack, so the same text works on every cell type", () => {
    for (const ch of " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:-/'()&!?") expect(DOT_FONT_CHARS).toContain(ch);
  });

  it("shows lower case in upper case and anything else blank", () => {
    expect(dotGlyph("a")).toEqual(dotGlyph("A"));
    expect(dotGlyph("é")).toEqual(dotGlyph(" "));
  });
});

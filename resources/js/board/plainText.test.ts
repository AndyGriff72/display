import { describe, expect, it } from "vitest";
import { composeBoard } from "./compose";
import { plainChar, plainText } from "./plainText";

describe("plainText", () => {
  it("turns typographers' punctuation into the plain kind", () => {
    expect(plainText("‘Ghosts’ cast: “We’ll keep going” – live…")).toBe(`'Ghosts' cast: "We'll keep going" - live.`);
  });

  it("takes accents off letters", () => {
    expect(plainText("Café Zürich, São Paulo, Øresund, Łódź")).toBe("Cafe Zurich, Sao Paulo, Oresund, Lodz");
    expect(plainChar("É")).toBe("E");
  });

  it("keeps every character one character, so text keeps its length", () => {
    const text = "“Naïve” résumé — ok 😀";
    expect(plainText(text)).toHaveLength(text.normalize("NFC").length - 1); // the emoji's two halves become one blank
    expect(plainText("é")).toBe("e"); // an accent written separately joins its letter first
  });

  it("leaves plain text alone", () => {
    expect(plainText("PLATFORM 4: 14:32 (ON TIME) & MORE!")).toBe("PLATFORM 4: 14:32 (ON TIME) & MORE!");
  });

  it("is what character cells are given", () => {
    const layout = { columns: 6, rows: 1, cell: { type: "splitflap" as const, width: 30, height: 50 }, fields: [{ id: "f", area: "0,0 to 5,0" }] };
    const cells = composeBoard(layout, { f: "“Café”" });
    expect([0, 1, 2, 3, 4, 5].map((x) => cells.get(`${x},0`)).join("")).toBe('"Cafe"');
  });
});

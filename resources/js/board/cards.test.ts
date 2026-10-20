import { describe, expect, it } from "vitest";
import { cellSpecs, composeBoard, turnGroups, withCards } from "./compose";
import { cardRects, validateLayout, type BoardLayout, type CardList } from "./layout";

const cell = { type: "splitflap", width: 30, height: 50 } as const;
const stories = [
  { title: "FIRST STORY", when: "09:00", body: "ONE" },
  { title: "SECOND", when: "10:00", body: "TWO" },
  { title: "THIRD", when: "11:00", body: "THREE" },
  { title: "FOURTH", when: "12:00", body: "FOUR" },
];

/** Cards 12 x 3: title and time on the top row, body below. Three fit one above another in 12 x 9. */
const news: CardList = {
  id: "news",
  area: "0,0 to 11,8",
  cardHeight: 3,
  parts: [
    { id: "title", area: "0,0 to 6,0", text: "{title}" },
    { id: "when", area: "7,0 to 11,0", text: "{when}", align: "right" },
    { id: "body", area: "0,1 to 11,2", text: "{body}" },
  ],
};
const board: BoardLayout = { columns: 12, rows: 9, cell, cards: [news] };
const row = (cells: Map<string, string>, y: number) => Array.from({ length: 12 }, (_, x) => cells.get(`${x},${y}`) ?? "·").join("");

describe("card lists", () => {
  it("places as many cards as fit, left to right then top to bottom", () => {
    expect(cardRects(news, { x1: 0, y1: 0, x2: 11, y2: 8 })).toEqual([
      { x1: 0, y1: 0, x2: 11, y2: 2 },
      { x1: 0, y1: 3, x2: 11, y2: 5 },
      { x1: 0, y1: 6, x2: 11, y2: 8 },
    ]);
    // Cards 6 wide in a 13 x 4 area: two across, one down; the spare column and row stay bare.
    expect(cardRects({ ...news, cardWidth: 6, cardHeight: 3 }, { x1: 1, y1: 0, x2: 13, y2: 3 })).toEqual([
      { x1: 1, y1: 0, x2: 6, y2: 2 },
      { x1: 7, y1: 0, x2: 12, y2: 2 },
    ]);
  });

  it("shows a record on each card, its parts placed within it", () => {
    const { layout, values } = withCards(board, stories, 0);
    const cells = composeBoard(layout, values, stories, 0);
    expect(row(cells, 0)).toBe("FIRST S09:00");
    expect(row(cells, 1)).toBe("ONE         ");
    expect(row(cells, 3)).toBe("SECOND 10:00");
    expect(row(cells, 6)).toBe("THIRD  11:00");
    expect(cellSpecs(layout).size).toBe(12 * 9);
  });

  it("pages through the records a card's worth at a time, a card with no record blank", () => {
    const { layout, values } = withCards(board, stories, 1);
    const cells = composeBoard(layout, values, stories, 1);
    expect(row(cells, 0)).toBe("FOURTH 12:00");
    expect(row(cells, 3)).toBe("            ");
    expect(row(cells, 6)).toBe("            ");
  });

  it("checks its cards fit and its parts fit the card", () => {
    expect(validateLayout(board)).toEqual([]);
    const bad: BoardLayout = {
      ...board,
      cards: [{ ...news, cardHeight: 10, parts: [{ id: "a", area: "0,0 to 12,0", text: "x" }, { id: "b", area: "0,0 to 3,0", text: "y" }] }],
    };
    expect(validateLayout(bad)).toEqual([
      'Card list "news": a card (12 x 10) is bigger than its area (12 x 9).',
      'Card list "news", part "a": 0,0 to 12,0 goes off the card, which runs from 0,0 to 11,9.',
    ]);
    const offCard: BoardLayout = { ...board, cards: [{ ...news, parts: [{ id: "a", area: "0,0 to 12,0", text: "x" }, { id: "b", area: "3,0 to 5,0", text: "y" }] }] };
    expect(validateLayout(offCard)).toEqual(['Card list "news", part "a": 0,0 to 12,0 goes off the card, which runs from 0,0 to 11,2.']);
    const overlap: BoardLayout = { ...board, fields: [{ id: "f", area: "0,0 to 3,0", text: "x" }] };
    expect(validateLayout(overlap)).toEqual(['"news" and "f" overlap.']);
  });
});

describe("turnGroups", () => {
  const cards = [{ x1: 0, y1: 0, x2: 11, y2: 2 }, { x1: 0, y1: 3, x2: 11, y2: 5 }];

  it("goes a row at a time, two rows at a time, or a card at a time", () => {
    const rows = turnGroups("row", cards);
    expect([0, 1, 2, 3].map((y) => rows(4, y))).toEqual([0, 1000, 2000, 3000]);
    const pairs = turnGroups("pair", cards);
    expect([0, 1, 2, 3, 4].map((y) => pairs(4, y))).toEqual([0, 0, 2000, 2000, 4000]);
    const byCard = turnGroups("card", cards);
    expect([0, 1, 2, 3, 5].map((y) => byCard(4, y))).toEqual([0, 0, 0, 3000, 3000]);
    // A position in no card goes by its row, after the cards above it.
    expect(byCard(4, 7)).toBe(7000);
  });
});

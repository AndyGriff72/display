import { parseArea, type Rect } from "../../board/layout";

/**
 * Where an area sits on the board, as four numbers: the column and row it starts at, and how
 * many columns and rows it takes. Counted from 1, as people count; the layout itself stores
 * "x1,y1 to x2,y2" counted from 0, which this converts to and from.
 */
export function PositionFields({
  area,
  columns,
  rows,
  onChange,
}: {
  area: string;
  /** The board's size, which the numbers are kept within. */
  columns: number;
  rows: number;
  onChange: (area: string) => void;
}) {
  const rect = parseArea(area ?? "") ?? { x1: 0, y1: 0, x2: 0, y2: 0 };
  const set = (patch: Partial<{ column: number; row: number; width: number; height: number }>) => {
    const column = clamp(patch.column ?? rect.x1 + 1, 1, columns);
    const row = clamp(patch.row ?? rect.y1 + 1, 1, rows);
    const width = clamp(patch.width ?? rect.x2 - rect.x1 + 1, 1, columns - column + 1);
    const height = clamp(patch.height ?? rect.y2 - rect.y1 + 1, 1, rows - row + 1);
    onChange(formatArea({ x1: column - 1, y1: row - 1, x2: column - 1 + width - 1, y2: row - 1 + height - 1 }));
  };
  const number = (label: string, value: number, min: number, max: number, key: "column" | "row" | "width" | "height", title: string) => (
    <label className="inline position-field" title={title}>
      {label}
      <input type="number" min={min} max={max} value={value} onChange={(e) => e.target.value !== "" && set({ [key]: Number(e.target.value) })} />
    </label>
  );

  return (
    <span className="position-fields">
      {number("Column", rect.x1 + 1, 1, columns, "column", "The column it starts in, counting from 1 at the left")}
      {number("Row", rect.y1 + 1, 1, rows, "row", "The row it starts in, counting from 1 at the top")}
      {number("Width", rect.x2 - rect.x1 + 1, 1, columns - rect.x1, "width", "How many columns it takes")}
      {number("Height", rect.y2 - rect.y1 + 1, 1, rows - rect.y1, "height", "How many rows it takes")}
    </span>
  );
}

/** An area as the layout stores it: "x1,y1 to x2,y2", or "x,y" for a single cell. */
export function formatArea(r: Rect): string {
  return r.x1 === r.x2 && r.y1 === r.y2 ? `${r.x1},${r.y1}` : `${r.x1},${r.y1} to ${r.x2},${r.y2}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

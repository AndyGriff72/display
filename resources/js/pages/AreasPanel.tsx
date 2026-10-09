import { DEFAULT_COLOURS, type AreaCell, type AreaCellType, type CellType, type FieldArea, type ListArea } from "../board/layout";
import { FONTS } from "../fonts";
import { OptionalColour } from "./StaticAreasPanel";

const TYPE_LABELS: Record<AreaCellType, string> = {
  splitflap: "Split-flap",
  dotmatrix: "Dot matrix",
  segment: "LED segments",
  flipdot: "Flip-dot",
  text: "Text",
};

/**
 * Each field and list column's cell style: the board's own cells, or a type and look of its
 * own. Cells keep the board's size whatever their type, so the grid holds together.
 */
export function AreasPanel({
  fields,
  lists,
  boardType,
  boardColour,
  cellHeight,
  onChange,
}: {
  fields: FieldArea[];
  lists: ListArea[];
  boardType: CellType;
  /** The board's character colour, which areas using the board's cells start from. */
  boardColour: string;
  cellHeight: number;
  onChange: (next: { fields: FieldArea[]; lists: ListArea[] }) => void;
}) {
  if (fields.length === 0 && lists.length === 0) return null;

  const setField = (i: number, cell: AreaCell | undefined) =>
    onChange({ fields: fields.map((f, j) => (j === i ? withCell(f, cell) : f)), lists });
  const setColumn = (l: number, c: number, cell: AreaCell | undefined) =>
    onChange({
      fields,
      lists: lists.map((list, j) => (j === l ? { ...list, columns: list.columns.map((col, k) => (k === c ? withCell(col, cell) : col)) } : list)),
    });

  return (
    <fieldset className="wide areas-panel">
      <legend>Areas</legend>
      <p className="hint">
        Each field and list column can use the board's cells or its own type. Text areas show ordinary text, which can hold
        more characters than the area is wide.
      </p>
      {fields.map((f, i) => (
        <div className="area-row" key={`f${i}`}>
          <span className="area-name">
            {f.id} <span className="hint">field · {f.area}</span>
          </span>
          <CellStyle cell={f.cell} boardType={boardType} boardColour={boardColour} cellHeight={cellHeight} onChange={(cell) => setField(i, cell)} />
        </div>
      ))}
      {lists.map((list, l) =>
        (Array.isArray(list.columns) ? list.columns : []).map((col, c) => (
          <div className="area-row" key={`l${l}c${c}`}>
            <span className="area-name">
              {list.id} › {col.title || col.text || `column ${c + 1}`} <span className="hint">list column {c + 1}</span>
            </span>
            <CellStyle cell={col.cell} boardType={boardType} boardColour={boardColour} cellHeight={cellHeight} onChange={(cell) => setColumn(l, c, cell)} />
          </div>
        ))
      )}
    </fieldset>
  );
}

/** Choose an area's cell type, then the settings that type has. */
function CellStyle({
  cell,
  boardType,
  boardColour,
  cellHeight,
  onChange,
}: {
  cell?: AreaCell;
  boardType: CellType;
  boardColour: string;
  cellHeight: number;
  onChange: (cell: AreaCell | undefined) => void;
}) {
  const type = cell?.type;
  // The type the area is drawn as: its own, or the board's.
  const drawnAs: AreaCellType = type ?? boardType;
  const hasBackground = (t: AreaCellType) => t === "splitflap" || t === "flipdot" || t === "text";
  const set = (patch: Partial<AreaCell>) => {
    const next = tidy({ ...cell, ...patch });
    onChange(Object.keys(next).length ? next : undefined);
  };

  // A new type keeps the colours chosen, where it can use them, but none of the last type's
  // other settings.
  const changeType = (value: string) => {
    const next = (value || undefined) as AreaCellType | undefined;
    const kept = tidy({
      type: next,
      color: cell?.color,
      background: hasBackground(next ?? boardType) ? cell?.background : undefined,
    });
    onChange(Object.keys(kept).length ? kept : undefined);
  };

  return (
    <span className="row-editor">
      <select value={type ?? ""} onChange={(e) => changeType(e.target.value)} aria-label="Cell type">
        <option value="">Board's cells ({TYPE_LABELS[boardType]})</option>
        {(Object.keys(TYPE_LABELS) as AreaCellType[]).map((t) => (
          <option key={t} value={t}>
            {TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      {type ? (
        <label className="inline">
          {type === "text" ? "Text" : "Colour"}
          <input type="color" value={toHex(cell?.color ?? DEFAULT_COLOURS[type])} onChange={(e) => set({ color: e.target.value })} />
        </label>
      ) : (
        // The board's cells: its colour, unless the area is given one of its own.
        <OptionalColour label="Own colour" value={cell?.color} fallback={toHex(boardColour)} onChange={(color) => set({ color })} />
      )}
      {hasBackground(drawnAs) && (
        <OptionalColour
          label={drawnAs === "splitflap" ? "Flap colour" : drawnAs === "flipdot" ? "Dark side" : "Background"}
          value={cell?.background}
          fallback={drawnAs === "splitflap" ? "#1d1d1f" : drawnAs === "flipdot" ? "#1c1c1c" : "#1b1b1d"}
          onChange={(background) => set({ background })}
        />
      )}
      {(type === "splitflap" || type === "text") && (
        <select value={cell?.fontFamily ?? ""} onChange={(e) => set({ fontFamily: e.target.value || undefined })} aria-label="Typeface">
          <option value="">Board's typeface</option>
          {FONTS.map((f) => (
            <option key={f.id} value={f.family}>
              {f.label}
            </option>
          ))}
        </select>
      )}
      {type === "segment" && (
        <select value={cell?.segments ?? 14} onChange={(e) => set({ segments: Number(e.target.value) as 7 | 14 })} aria-label="Segments">
          <option value={14}>14 segments</option>
          <option value={7}>7 segments</option>
        </select>
      )}
      {type === "text" && (
        <label className="inline">
          Size
          <input
            type="number"
            min={4}
            max={400}
            value={cell?.fontSize ?? Math.round(cellHeight * 0.6)}
            onChange={(e) => set({ fontSize: Number(e.target.value) || undefined })}
            style={{ width: 60 }}
          />
        </label>
      )}
    </span>
  );
}

function withCell<T extends { cell?: AreaCell }>(area: T, cell: AreaCell | undefined): T {
  const { cell: _old, ...rest } = area;
  return (cell ? { ...rest, cell } : rest) as T;
}

/** Leave settings that have been cleared out of the layout, rather than saving them empty. */
function tidy(cell: AreaCell): AreaCell {
  const out = { ...cell } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === undefined || out[k] === "") delete out[k];
  return out as AreaCell;
}

/** A colour input only takes #rrggbb; anything else (a named colour, say) shows as black. */
function toHex(colour: string): string {
  return /^#[0-9a-f]{6}$/i.test(colour) ? colour : /^#[0-9a-f]{3}$/i.test(colour) ? "#" + [...colour.slice(1)].map((c) => c + c).join("") : "#000000";
}

import {
  DEFAULT_COLOURS,
  DEFAULT_LINE_HEIGHT,
  FINISH_COLOURS,
  type AreaCell,
  type AreaCellType,
  type CellType,
  type FieldArea,
  type Finish,
  type ListArea,
} from "../board/layout";
import { FONTS } from "../fonts";
import { OptionalColour } from "./StaticAreasPanel";
import { CELL_LOOKS, lookById, lookId, lookLabel } from "./cellLooks";

/**
 * Each field and list column's cell style: the board's own cells, or a type and look of its
 * own. Cells keep the board's size whatever their type, so the grid holds together.
 */
export function AreasPanel({
  fields,
  lists,
  boardType,
  boardFinish,
  boardColour,
  cellHeight,
  onChange,
}: {
  fields: FieldArea[];
  lists: ListArea[];
  boardType: CellType;
  boardFinish?: Finish;
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
          <CellStyle cell={f.cell} boardType={boardType} boardFinish={boardFinish} boardColour={boardColour} cellHeight={cellHeight} onChange={(cell) => setField(i, cell)} />
        </div>
      ))}
      {lists.map((list, l) =>
        (Array.isArray(list.columns) ? list.columns : []).map((col, c) => (
          <div className="area-row" key={`l${l}c${c}`}>
            <span className="area-name">
              {list.id} › {col.title || col.text || `column ${c + 1}`} <span className="hint">list column {c + 1}</span>
            </span>
            <CellStyle cell={col.cell} boardType={boardType} boardFinish={boardFinish} boardColour={boardColour} cellHeight={cellHeight} onChange={(cell) => setColumn(l, c, cell)} />
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
  boardFinish,
  boardColour,
  cellHeight,
  onChange,
}: {
  cell?: AreaCell;
  boardType: CellType;
  boardFinish?: Finish;
  boardColour: string;
  cellHeight: number;
  onChange: (cell: AreaCell | undefined) => void;
}) {
  const type = cell?.type;
  const look = type && type !== "text" ? lookId(type, cell?.finish) : type;
  // The type the area is drawn as: its own, or the board's.
  const drawnAs: AreaCellType = type ?? boardType;
  const hasBackground = (t: AreaCellType) => t === "splitflap" || t === "flipdot" || t === "text";
  const set = (patch: Partial<AreaCell>) => {
    const next = tidy({ ...cell, ...patch });
    onChange(Object.keys(next).length ? next : undefined);
  };

  // A new type keeps the colours chosen, where it can use them, but none of the last type's
  // other settings. A different finish brings its own colour, as on the board.
  const changeType = (value: string) => {
    const chosen = value === "text" ? { type: "text" as const } : value ? lookById(value) : undefined;
    const next = chosen?.type;
    const finish = chosen && "finish" in chosen ? chosen.finish : undefined;
    const kept = tidy({
      type: next,
      finish,
      color: finish !== cell?.finish ? undefined : cell?.color,
      background: hasBackground(next ?? boardType) ? cell?.background : undefined,
    });
    onChange(Object.keys(kept).length ? kept : undefined);
  };

  return (
    <span className="row-editor">
      <select value={look ?? ""} onChange={(e) => changeType(e.target.value)} aria-label="Cell type">
        <option value="">Board's cells ({lookLabel(boardType, boardFinish)})</option>
        {CELL_LOOKS.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
      {type ? (
        <label className="inline">
          {type === "text" ? "Text" : "Colour"}
          <input
            type="color"
            value={toHex(cell?.color ?? (cell?.finish ? FINISH_COLOURS[cell.finish] : undefined) ?? DEFAULT_COLOURS[type])}
            onChange={(e) => set({ color: e.target.value })}
          />
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
        <>
          <label className="inline">
            Letters
            <input
              type="number"
              min={-4}
              max={30}
              value={cell?.letterSpacing ?? 0}
              onChange={(e) => set({ letterSpacing: Number(e.target.value) || undefined })}
              style={{ width: 56 }}
              title="Extra space between characters, in pixels"
            />
          </label>
          <label className="inline">
            Lines
            <input
              type="number"
              min={0.8}
              max={3}
              step={0.05}
              value={cell?.lineHeight ?? DEFAULT_LINE_HEIGHT}
              onChange={(e) => set({ lineHeight: Number(e.target.value) || undefined })}
              style={{ width: 64 }}
              title="Line height, as a multiple of the text size"
            />
          </label>
        </>
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

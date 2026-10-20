import { columnOffsets, parseArea, type CellType, type FieldArea, type Finish, type ListArea, type ListColumn, type ImageValue, type TextStyle, type WholeValue } from "../../board/layout";
import { imageSource } from "../../board/images";
import { OptionalColour } from "../StaticAreasPanel";
import { CellStyle, withCell } from "./CellStyle";
import { PositionFields, formatArea } from "./PositionFields";

const ALIGNS: { value: "left" | "center" | "right"; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
];

export interface AreasEditorProps {
  fields: FieldArea[];
  lists: ListArea[];
  /** The board's size, which positions are kept within. */
  columns: number;
  rows: number;
  boardType: CellType;
  boardFinish?: Finish;
  boardColour: string;
  cellHeight: number;
  /** A text board's bold, italic and underline. */
  boardTextStyle?: TextStyle;
  /** Columns the data has, offered as a reminder of what templates can use. */
  dataColumns: string[];
  /** What each field shows right now, by id. */
  showing: Record<string, string>;
  onChange: (next: { fields: FieldArea[]; lists: ListArea[] }) => void;
}

/**
 * The board's fields and lists, edited without the JSON: where each one is, what it shows, and
 * how it is drawn.
 *
 * A field is one piece of text: fixed words, or columns from the data in braces. A list shows
 * the data's records one per row, in columns that can start anywhere along it, leaving the space
 * between them bare.
 */
export function AreasEditor(props: AreasEditorProps) {
  const { fields, lists, columns, rows, onChange } = props;
  const style = { boardType: props.boardType, boardFinish: props.boardFinish, boardColour: props.boardColour, cellHeight: props.cellHeight, boardTextStyle: props.boardTextStyle };

  const setField = (i: number, patch: Partial<FieldArea>) =>
    onChange({ fields: fields.map((f, j) => (j === i ? tidyField({ ...f, ...patch }) : f)), lists });
  const setList = (i: number, patch: Partial<ListArea>) => onChange({ fields, lists: lists.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const setColumn = (l: number, c: number, patch: Partial<ListColumn>) =>
    setList(l, { columns: lists[l].columns.map((col, k) => (k === c ? tidyColumn({ ...col, ...patch }) : col)) });

  const usedIds = new Set([...fields.map((f) => f.id), ...lists.map((l) => l.id)]);
  const freshId = (base: string) => {
    let n = 1;
    while (usedIds.has(`${base}${n}`)) n++;
    return `${base}${n}`;
  };

  const addField = () =>
    onChange({
      fields: [...fields, { id: freshId("field"), area: formatArea({ x1: 0, y1: 0, x2: Math.min(9, columns - 1), y2: 0 }), text: "" }],
      lists,
    });
  const addList = () =>
    onChange({
      fields,
      lists: [
        ...lists,
        { id: freshId("list"), area: formatArea({ x1: 0, y1: 0, x2: columns - 1, y2: Math.min(3, rows - 1) }), header: true, columns: [{ title: "", text: "" }] },
      ],
    });

  return (
    <div className="areas-editor">
      <p className="hint">
        Fields show one piece of text; lists show your data's records, one per row. Put a column's name from the data in braces to
        show it, such as <code>{"{destination}"}</code>, or <code>{"{departs_at|HH:mm}"}</code> for a time.
      </p>
      {props.dataColumns.length > 0 && (
        <p className="hint">
          Your data has: {props.dataColumns.map((c) => <code key={c} className="chip">{`{${c}}`}</code>)}
        </p>
      )}

      <h3>Fields</h3>
      {fields.length === 0 && <p className="hint">None yet.</p>}
      {fields.map((f, i) => {
        const rect = parseArea(f.area ?? "");
        const tall = !!rect && rect.y2 > rect.y1;
        const fromData = typeof f.text === "string" && f.text.includes("{");
        return (
          <div className="area-card" key={`f${i}`}>
            <div className="area-card-head">
              <input className="area-id" value={f.id} onChange={(e) => setField(i, { id: e.target.value })} aria-label="Field name" />
              <button className="icon" title="Remove this field" onClick={() => onChange({ fields: fields.filter((_, j) => j !== i), lists })}>
                ×
              </button>
            </div>
            <PositionFields area={f.area} columns={columns} rows={rows} onChange={(area) => setField(i, { area })} />
            <label>
              Shows
              {tall ? (
                <textarea rows={2} value={f.text ?? ""} onChange={(e) => setField(i, { text: e.target.value })} placeholder="Words, or {column} from the data" />
              ) : (
                <input value={f.text ?? ""} onChange={(e) => setField(i, { text: e.target.value })} placeholder="Words, or {column} from the data" />
              )}
            </label>
            <div className="row-editor">
              <select value={f.align ?? "left"} onChange={(e) => setField(i, { align: e.target.value as FieldArea["align"] })} aria-label="Alignment">
                {ALIGNS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              {fromData && (
                <label className="inline" title="Which record of the data this field shows: 1 is the first">
                  Record
                  <input
                    type="number"
                    min={1}
                    value={(f.row ?? 0) + 1}
                    onChange={(e) => setField(i, { row: Math.max(0, Number(e.target.value) - 1) || undefined })}
                    style={{ width: 60 }}
                  />
                </label>
              )}
              <span className="hint">now: {showingNow(props.showing[f.id])}</span>
            </div>
            <CellStyle cell={f.cell} {...style} onChange={(cell) => onChange({ fields: fields.map((x, j) => (j === i ? withCell(x, cell) : x)), lists })} />
            <ImageOption area={f} onChange={(patch) => setField(i, patch)} />
            {(f.cell?.type ?? props.boardType) === "splitflap" && !f.image && <WholeValueOption area={f} onChange={(patch) => setField(i, patch)} />}
          </div>
        );
      })}
      <button onClick={addField}>+ Add a field</button>

      <h3>Lists</h3>
      {lists.length === 0 && <p className="hint">None yet.</p>}
      {lists.map((list, l) => {
        const rect = parseArea(list.area ?? "");
        const cols = Array.isArray(list.columns) ? list.columns : [];
        const offsets = rect ? columnOffsets(cols, rect.x2 - rect.x1 + 1) : [];
        const left = rect?.x1 ?? 0;
        return (
          <div className="area-card" key={`l${l}`}>
            <div className="area-card-head">
              <input className="area-id" value={list.id} onChange={(e) => setList(l, { id: e.target.value })} aria-label="List name" />
              <button className="icon" title="Remove this list" onClick={() => onChange({ fields, lists: lists.filter((_, j) => j !== l) })}>
                ×
              </button>
            </div>
            <PositionFields area={list.area} columns={columns} rows={rows} onChange={(area) => setList(l, { area })} />
            <div className="row-editor">
              <label className="inline">
                <input type="checkbox" checked={!!list.header} onChange={(e) => setList(l, { header: e.target.checked || undefined })} />
                Header row of column titles
              </label>
              {list.header && (
                <OptionalColour label="Header colour" value={list.headerColor} fallback="#ffcc33" onChange={(headerColor) => setList(l, { headerColor })} />
              )}
            </div>

            <div className="list-columns">
              {cols.map((col, c) => (
                <div className="list-column" key={c}>
                  <div className="row-editor">
                    <span className="list-column-number">{c + 1}</span>
                    {list.header && (
                      <input value={col.title ?? ""} onChange={(e) => setColumn(l, c, { title: e.target.value })} placeholder="Title" aria-label="Title" size={10} />
                    )}
                    <input value={col.text ?? ""} onChange={(e) => setColumn(l, c, { text: e.target.value })} placeholder="{column}" aria-label="Shows" size={16} />
                    <button
                      className="icon"
                      title="Remove this column"
                      onClick={() => setList(l, { columns: cols.filter((_, k) => k !== c) })}
                      disabled={cols.length === 1}
                    >
                      ×
                    </button>
                  </div>
                  <div className="row-editor">
                    <label className="inline" title="The board column it starts in. Leave empty to start one cell after the column before.">
                      Starts at
                      <input
                        type="number"
                        min={left + 1}
                        max={columns}
                        value={col.x === undefined ? "" : left + col.x + 1}
                        placeholder={offsets[c] ? String(left + offsets[c].start + 1) : ""}
                        onChange={(e) => setColumn(l, c, { x: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) - 1 - left) })}
                        style={{ width: 64 }}
                      />
                    </label>
                    <label className="inline" title={c === cols.length - 1 ? "Leave empty to run to the list's right edge" : "How many characters wide"}>
                      Width
                      <input
                        type="number"
                        min={1}
                        value={col.width ?? ""}
                        placeholder={offsets[c] ? String(offsets[c].width) : ""}
                        onChange={(e) => setColumn(l, c, { width: e.target.value === "" ? undefined : Math.max(1, Number(e.target.value)) })}
                        style={{ width: 56 }}
                      />
                    </label>
                    <select value={col.align ?? "left"} onChange={(e) => setColumn(l, c, { align: e.target.value as ListColumn["align"] })} aria-label="Alignment">
                      {ALIGNS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <CellStyle
                    cell={col.cell}
                    {...style}
                    onChange={(cell) => setList(l, { columns: cols.map((x, k) => (k === c ? withCell(x, cell) : x)) })}
                  />
                  <ImageOption area={col} onChange={(patch) => setColumn(l, c, patch)} />
                  {(col.cell?.type ?? props.boardType) === "splitflap" && !col.image && (
                    <WholeValueOption area={col} onChange={(patch) => setColumn(l, c, patch)} />
                  )}
                </div>
              ))}
              <button onClick={() => setList(l, { columns: [...cols, { title: "", text: "" }] })}>+ Add a column</button>
            </div>
          </div>
        );
      })}
      <button onClick={addList}>+ Add a list</button>
    </div>
  );
}

/** What a field shows now, in a few words: an image's source is far too long to print. */
function showingNow(value: string | undefined): string {
  if (!value) return "nothing";
  return imageSource(value, false) ? "an image" : `"${value}"`;
}

const FITS: { value: NonNullable<ImageValue["fit"]>; label: string }[] = [
  { value: "contain", label: "Whole image" },
  { value: "cover", label: "Fill, cropping" },
  { value: "fill", label: "Stretch to fill" },
];

/**
 * Show the value as an image: on split-flap, one long flap with an image on each face; on
 * anything else, the image drawn plainly in the space.
 */
function ImageOption({ area, onChange }: { area: ImageValue; onChange: (patch: ImageValue) => void }) {
  return (
    <div className="row-editor">
      <label className="inline" title="For data holding images. On split-flap, each image is a face on one long flap; on other displays, the image is drawn in the space.">
        <input type="checkbox" checked={!!area.image} onChange={(e) => onChange({ image: e.target.checked || undefined, fit: e.target.checked ? area.fit : undefined })} />
        Show as image
      </label>
      {area.image && (
        <select value={area.fit ?? "contain"} onChange={(e) => onChange({ fit: e.target.value === "contain" ? undefined : (e.target.value as ImageValue["fit"]) })} aria-label="Fit">
          {FITS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/**
 * Split-flap only: show the whole value on one long flap, and optionally which faces its drum
 * has, in order. The faces are typed one per line; blank lines are kept while typing (so a new
 * line can be started) and tidied away when the box is left.
 */
function WholeValueOption({ area, onChange }: { area: WholeValue; onChange: (patch: WholeValue) => void }) {
  const drum = Array.isArray(area.drum) ? area.drum : [];
  return (
    <div className="whole-value">
      <label className="inline" title="Show the whole value on one long flap, as station boards do for statuses, instead of a cell per character">
        <input type="checkbox" checked={!!area.merged} onChange={(e) => onChange({ merged: e.target.checked || undefined })} />
        One flap for the whole value
      </label>
      {area.merged && (
        <label>
          Values, in drum order <span className="hint">(optional)</span>
          <textarea
            rows={3}
            value={drum.join("\n")}
            onChange={(e) => onChange({ drum: e.target.value.split("\n") })}
            onBlur={() => onChange({ drum: drum.map((f) => f.trim()).filter((f) => f !== "") })}
            placeholder={"One per line, e.g.\nON TIME\nDELAYED\nCANCELLED"}
          />
          <span className="hint">Any other values in the data follow these, alphabetically.</span>
        </label>
      )}
    </div>
  );
}

/** Leave out settings that are back at their defaults, rather than saving them empty. */
function tidyField(f: FieldArea): FieldArea {
  return tidyKeys(f, ["align", "row", "merged", "drum", "image", "fit"]);
}

function tidyColumn(c: ListColumn): ListColumn {
  return tidyKeys(c, ["x", "width", "align", "merged", "drum", "image", "fit"]);
}

function tidyKeys<T extends object>(area: T, keys: string[]): T {
  const out = { ...area } as Record<string, unknown>;
  for (const key of keys) {
    const v = out[key];
    if (v === undefined || v === "left" || (Array.isArray(v) && v.length === 0)) delete out[key];
  }
  return out as T;
}

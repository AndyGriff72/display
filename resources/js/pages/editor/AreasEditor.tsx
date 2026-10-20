import { cardRects, cardSize, columnOffsets, parseArea, type CardList, type CardPart, type CellType, type FieldArea, type Finish, type ListArea, type ListColumn, type ImageValue, type TextStyle, type WholeValue } from "../../board/layout";
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
  cards: CardList[];
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
  /** Given what changed: fields, lists or card lists. */
  onChange: (next: { fields?: FieldArea[]; lists?: ListArea[]; cards?: CardList[] }) => void;
}

/**
 * The board's fields and lists, edited without the JSON: where each one is, what it shows, and
 * how it is drawn.
 *
 * A field is one piece of text: fixed words, or columns from the data in braces. A list shows
 * the data's records one per row, in columns that can start anywhere along it, leaving the space
 * between them bare. A card list shows them one per card: a card designed once, from parts like
 * fields, repeated over an area.
 */
export function AreasEditor(props: AreasEditorProps) {
  const { fields, lists, cards, columns, rows, onChange } = props;
  const style = { boardType: props.boardType, boardFinish: props.boardFinish, boardColour: props.boardColour, cellHeight: props.cellHeight, boardTextStyle: props.boardTextStyle };

  const setField = (i: number, patch: Partial<FieldArea>) =>
    onChange({ fields: fields.map((f, j) => (j === i ? tidyField({ ...f, ...patch }) : f)), lists });
  const setList = (i: number, patch: Partial<ListArea>) => onChange({ fields, lists: lists.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const setColumn = (l: number, c: number, patch: Partial<ListColumn>) =>
    setList(l, { columns: lists[l].columns.map((col, k) => (k === c ? tidyColumn({ ...col, ...patch }) : col)) });

  const setCards = (i: number, patch: Partial<CardList>) => onChange({ cards: cards.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setPart = (c: number, p: number, patch: Partial<CardPart>) =>
    setCards(c, { parts: cards[c].parts.map((part, k) => (k === p ? (tidyField({ ...part, ...patch } as FieldArea) as CardPart) : part)) });

  const usedIds = new Set([...fields.map((f) => f.id), ...lists.map((l) => l.id), ...cards.map((c) => c.id)]);
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
  // A card list over the whole board: cards three rows high, one above another, each with a title.
  const addCards = () =>
    onChange({
      cards: [
        ...cards,
        {
          id: freshId("cards"),
          area: formatArea({ x1: 0, y1: 0, x2: columns - 1, y2: rows - 1 }),
          cardHeight: Math.min(3, rows),
          parts: [{ id: "title", area: formatArea({ x1: 0, y1: 0, x2: columns - 1, y2: 0 }), text: "" }],
        },
      ],
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
      {fields.map((f, i) => (
        <div className="area-card" key={`f${i}`}>
          <div className="area-card-head">
            <input className="area-id" value={f.id} onChange={(e) => setField(i, { id: e.target.value })} aria-label="Field name" />
            <button className="icon" title="Remove this field" onClick={() => onChange({ fields: fields.filter((_, j) => j !== i), lists })}>
              ×
            </button>
          </div>
          <FieldBody
            field={f}
            columns={columns}
            rows={rows}
            style={style}
            boardType={props.boardType}
            showing={props.showing[f.id]}
            onChange={(patch) => setField(i, patch)}
            onCell={(cell) => onChange({ fields: fields.map((x, j) => (j === i ? withCell(x, cell) : x)), lists })}
          />
        </div>
      ))}
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

      <h3>Card lists</h3>
      <p className="hint">
        One card designed once, repeated over an area: each card shows the next record, and the cards page through the records
        together. Parts are placed within the card, counting from its top left.
      </p>
      {cards.length === 0 && <p className="hint">None yet.</p>}
      {cards.map((list, c) => {
        const rect = parseArea(list.area ?? "");
        const size = rect ? cardSize(list, rect) : { width: columns, height: 1 };
        const fit = rect ? cardRects(list, rect) : [];
        const across = rect ? Math.floor((rect.x2 - rect.x1 + 1) / size.width) : 0;
        const parts = Array.isArray(list.parts) ? list.parts : [];
        return (
          <div className="area-card" key={`c${c}`}>
            <div className="area-card-head">
              <input className="area-id" value={list.id} onChange={(e) => setCards(c, { id: e.target.value })} aria-label="Card list name" />
              <button className="icon" title="Remove this card list" onClick={() => onChange({ cards: cards.filter((_, j) => j !== c) })}>
                ×
              </button>
            </div>
            <PositionFields area={list.area} columns={columns} rows={rows} onChange={(area) => setCards(c, { area })} />
            <div className="row-editor">
              <label className="inline">
                Card height
                <input
                  type="number"
                  min={1}
                  max={rows}
                  value={list.cardHeight}
                  onChange={(e) => setCards(c, { cardHeight: Math.max(1, Number(e.target.value) || 1) })}
                  style={{ width: 60 }}
                />
              </label>
              <label className="inline" title="Leave empty for cards as wide as the area, one above another">
                Card width
                <input
                  type="number"
                  min={1}
                  max={columns}
                  value={list.cardWidth ?? ""}
                  placeholder={String(size.width)}
                  onChange={(e) => {
                    const { cardWidth: _old, ...rest } = list;
                    const width = Number(e.target.value);
                    onChange({ cards: cards.map((x, j) => (j === c ? (e.target.value === "" || !width ? rest : { ...rest, cardWidth: width }) : x)) });
                  }}
                  style={{ width: 60 }}
                />
              </label>
              <span className="hint">
                {fit.length} card{fit.length === 1 ? "" : "s"} fit{across > 1 ? ` (${across} across)` : ""}
              </span>
            </div>
            <div className="list-columns">
              {parts.map((part, p) => (
                <div className="list-column" key={p}>
                  <div className="row-editor">
                    <span className="list-column-number">{p + 1}</span>
                    <input className="area-id" value={part.id ?? ""} onChange={(e) => setPart(c, p, { id: e.target.value })} aria-label="Part name" placeholder="Part name" />
                    <button className="icon" title="Remove this part" onClick={() => setCards(c, { parts: parts.filter((_, k) => k !== p) })} disabled={parts.length === 1}>
                      ×
                    </button>
                  </div>
                  <FieldBody
                    field={part as FieldArea}
                    columns={size.width}
                    rows={size.height}
                    style={style}
                    boardType={props.boardType}
                    onChange={(patch) => setPart(c, p, patch)}
                    onCell={(cell) => setCards(c, { parts: parts.map((x, k) => (k === p ? withCell(x, cell) : x)) })}
                  />
                </div>
              ))}
              <button onClick={() => setCards(c, { parts: [...parts, { id: freshPart(parts), area: "0,0", text: "" }] })}>+ Add a part</button>
            </div>
          </div>
        );
      })}
      <button onClick={addCards}>+ Add a card list</button>
    </div>
  );
}

/**
 * Where a field (or a card's part) is and what it shows: its position (within the board, or
 * within a card), its text, alignment, which record (fields only), and how it is drawn.
 */
function FieldBody({
  field: f,
  columns,
  rows,
  style,
  boardType,
  showing,
  onChange,
  onCell,
}: {
  field: FieldArea;
  columns: number;
  rows: number;
  style: Omit<Parameters<typeof CellStyle>[0], "cell" | "onChange">;
  boardType: CellType;
  /** What a field shows now; a card's part leaves it out, as each card shows something different. */
  showing?: string;
  onChange: (patch: Partial<FieldArea>) => void;
  onCell: (cell: FieldArea["cell"]) => void;
}) {
  const rect = parseArea(f.area ?? "");
  const tall = !!rect && rect.y2 > rect.y1;
  const fromData = typeof f.text === "string" && f.text.includes("{");
  const isPart = showing === undefined;
  return (
    <>
      <PositionFields area={f.area} columns={columns} rows={rows} onChange={(area) => onChange({ area })} />
      <label>
        Shows
        {tall ? (
          <textarea rows={2} value={f.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} placeholder="Words, or {column} from the data" />
        ) : (
          <input value={f.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} placeholder="Words, or {column} from the data" />
        )}
      </label>
      <div className="row-editor">
        <select value={f.align ?? "left"} onChange={(e) => onChange({ align: e.target.value as FieldArea["align"] })} aria-label="Alignment">
          {ALIGNS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        {fromData && !isPart && (
          <label className="inline" title="Which record of the data this field shows: 1 is the first">
            Record
            <input
              type="number"
              min={1}
              value={(f.row ?? 0) + 1}
              onChange={(e) => onChange({ row: Math.max(0, Number(e.target.value) - 1) || undefined })}
              style={{ width: 60 }}
            />
          </label>
        )}
        {!isPart && <span className="hint">now: {showingNow(showing)}</span>}
      </div>
      <CellStyle cell={f.cell} {...style} onChange={onCell} />
      <ImageOption area={f} onChange={onChange} />
      {(f.cell?.type ?? boardType) === "splitflap" && !f.image && <WholeValueOption area={f} onChange={onChange} />}
    </>
  );
}

/** A name for a new part that no other part of the card has. */
function freshPart(parts: CardPart[]): string {
  let n = parts.length + 1;
  while (parts.some((p) => p.id === `part${n}`)) n++;
  return `part${n}`;
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

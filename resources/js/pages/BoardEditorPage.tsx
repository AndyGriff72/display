import { useEffect, useMemo, useState } from "react";
import { listDataSources, type SavedDataSource } from "../api/dataSources";
import { flapSound } from "../audio/flapSound";
import { bindFields, templateColumns } from "../board/binding";
import { Board } from "../board/Board";
import { useBoardData } from "../board/useBoardData";
import { CELL_TYPES, parseArea, validateLayout, type BoardLayout, type CellType } from "../board/layout";
import { CHARSETS, type CharsetName } from "../cells/charsets";
import { FONTS, loadFont } from "../fonts";

/** The layout's structure. Cell appearance comes from the controls below the editor. */
type LayoutShape = Omit<BoardLayout, "cell">;

const SAMPLE_LAYOUT: LayoutShape = {
  columns: 24,
  rows: 4,
  statics: [{ id: "logo", area: "0,0 to 3,3", image: "/sample-logo.svg", padding: 16, background: "#1f3a6b" }],
  // The templates match the sample departures table (database/samples/departures.mysql.sql).
  // They are used once a data source is chosen; until then the fields show typed text.
  fields: [
    { id: "time", area: "4,0 to 8,0", text: "{departs_at|HH:mm}" },
    { id: "destination", area: "10,0 to 23,0", text: "{destination}" },
    { id: "calling", area: "4,1 to 23,2", text: "{calling_at}" },
    { id: "platform", area: "4,3 to 14,3", text: "PLATFORM {platform}" },
    { id: "status", area: "15,3 to 23,3", align: "right", text: "{status}" },
  ],
};

const DEPARTURES: Record<string, string>[] = [
  { time: "14:32", destination: "LONDON EUSTON", calling: "CREWE, STAFFORD,\nMILTON KEYNES", platform: "PLATFORM 4", status: "ON TIME" },
  { time: "14:47", destination: "MANCHESTER", calling: "WARRINGTON BANK QUAY", platform: "PLATFORM 11", status: "DELAYED" },
  { time: "15:05", destination: "EDINBURGH", calling: "CARLISLE,\nLOCKERBIE", platform: "PLATFORM 2", status: "BOARDING" },
  { time: "15:20", destination: "GLASGOW", calling: "PRESTON, LANCASTER,\nOXENHOLME, PENRITH", platform: "PLATFORM 9", status: "CANCELLED" },
];

const CELL_TYPE_LABELS: Record<CellType, string> = {
  splitflap: "Split-flap",
  dotmatrix: "Dot matrix",
  segment: "LED segments",
};

/** Each cell type starts in the colour it is best known in. */
const DEFAULT_COLOURS: Record<CellType, string> = {
  splitflap: "#f3efe2",
  dotmatrix: "#ffb000",
  segment: "#ff3b1f",
};

const COLOUR_PRESETS = [
  { label: "Amber", value: "#ffb000" },
  { label: "Red", value: "#ff3b1f" },
  { label: "Green", value: "#39ff6a" },
  { label: "White", value: "#f3efe2" },
  { label: "Blue", value: "#3fa9ff" },
];

const playFlap = () => flapSound.play();

export default function BoardEditorPage() {
  const [layoutText, setLayoutText] = useState(() => JSON.stringify(SAMPLE_LAYOUT, null, 2));
  const [shape, setShape] = useState<LayoutShape>(SAMPLE_LAYOUT);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [values, setValues] = useState(DEPARTURES[0]);
  const [departure, setDeparture] = useState(0);
  const [showAreas, setShowAreas] = useState(true);
  const [dataSources, setDataSources] = useState<SavedDataSource[]>([]);

  const [cellType, setCellType] = useState<CellType>("splitflap");
  const [colour, setColour] = useState(DEFAULT_COLOURS.splitflap);
  const [segments, setSegments] = useState<7 | 14>(14);
  const [cellWidth, setCellWidth] = useState(32);
  const [cellHeight, setCellHeight] = useState(50);
  const [flipMs, setFlipMs] = useState(80);
  const [fontId, setFontId] = useState(FONTS[0].id);
  const [stackName, setStackName] = useState<CharsetName>("standard");
  const [soundOn, setSoundOn] = useState(false);
  const [volume, setVolume] = useState(0.5);

  // The data sources to choose from. None (or no connection yet) just leaves the list empty.
  useEffect(() => {
    listDataSources()
      .then(setDataSources)
      .catch(() => setDataSources([]));
  }, []);

  const data = useBoardData(shape.dataSource);
  const source = dataSources.find((s) => s.uuid === shape.dataSource);
  const fields = shape.fields ?? [];
  const bound = (f: { text?: unknown }) => !!shape.dataSource && typeof f.text === "string";

  // Bound fields take their text from the data; the rest keep what was typed.
  const boardValues = useMemo(
    () => (shape.dataSource ? { ...values, ...bindFields(fields.filter(bound), data.rows) } : values),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shape, values, data.rows]
  );

  // Columns the templates use that the data does not have: almost always a typing mistake.
  const missingColumns = useMemo(() => {
    if (!shape.dataSource || data.columns.length === 0) return [];
    const have = new Set(data.columns);
    const used = fields.filter(bound).flatMap((f) => templateColumns(f.text as string));
    return [...new Set(used)].filter((c) => !have.has(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, data.columns]);

  const chooseDataSource = (key: string) => {
    const { dataSource: _old, ...rest } = shape;
    const next: LayoutShape = key ? { ...rest, dataSource: key } : rest;
    setShape(next);
    setLayoutText(JSON.stringify(next, null, 2));
    setJsonError(null);
  };

  const font = FONTS.find((f) => f.id === fontId) ?? FONTS[0];
  useEffect(() => loadFont(font), [font]);
  useEffect(() => flapSound.setVolume(volume), [volume]);

  const layout: BoardLayout = useMemo(
    () => ({
      ...shape,
      cell: {
        type: cellType,
        width: cellWidth,
        height: cellHeight,
        color: colour,
        fontFamily: font.family,
        stack: CHARSETS[stackName],
        flipMs,
        segments,
      },
    }),
    [shape, cellType, cellWidth, cellHeight, colour, font, stackName, flipMs, segments]
  );
  const layoutErrors = useMemo(() => validateLayout(layout), [layout]);

  // Keep the last layout that parsed on the board while the JSON is mid-edit.
  const editLayout = (text: string) => {
    setLayoutText(text);
    try {
      setShape(JSON.parse(text));
      setJsonError(null);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  };

  const changeCellType = (type: CellType) => {
    setCellType(type);
    setColour(DEFAULT_COLOURS[type]);
  };

  const toggleSound = async () => {
    if (soundOn) {
      flapSound.disable();
      setSoundOn(false);
    } else {
      await flapSound.enable();
      setSoundOn(true);
    }
  };

  const nextDeparture = () => {
    const next = (departure + 1) % DEPARTURES.length;
    setDeparture(next);
    setValues(DEPARTURES[next]);
  };

  return (
    <main className="app">
      <div className="board-wrap">
        <Board layout={layout} values={boardValues} onFlap={playFlap} showAreas={showAreas} />
      </div>

      <section className="controls">
        <label className="wide">
          Data source
          <select value={shape.dataSource ?? ""} onChange={(e) => chooseDataSource(e.target.value)}>
            <option value="">None: show the text typed below</option>
            {dataSources.map((s) => (
              <option key={s.uuid} value={s.uuid}>
                {s.name}
              </option>
            ))}
            {shape.dataSource && !source && <option value={shape.dataSource}>Unknown data source</option>}
          </select>
        </label>
        {shape.dataSource && <DataStatus data={data} name={source?.name} missing={missingColumns} />}

        <div className="buttons wide">
          {!shape.dataSource && <button onClick={nextDeparture}>Next departure</button>}
          <button onClick={toggleSound}>{soundOn ? "Sound off" : "Sound on"}</button>
          <label className="check">
            <input type="checkbox" checked={showAreas} onChange={(e) => setShowAreas(e.target.checked)} />
            Outline areas
          </label>
        </div>

        <fieldset className="wide">
          <legend>Fields</legend>
          {fields.map((f) => {
            const rect = parseArea(f.area ?? "");
            const multiRow = !!rect && rect.y2 > rect.y1;
            const set = (v: string) => setValues((old) => ({ ...old, [f.id]: v }));
            if (bound(f)) {
              return (
                <div key={f.id} className="bound-field">
                  <span>
                    {f.id} <span className="hint">{f.area}</span>
                  </span>
                  <code>{f.text}</code>
                  <span className="hint">
                    from row {(f.row ?? 0) + 1} of the data: {boardValues[f.id] ? `"${boardValues[f.id]}"` : "nothing"}
                  </span>
                </div>
              );
            }
            return (
              <label key={f.id}>
                <span>
                  {f.id} <span className="hint">{f.area}</span>
                </span>
                {multiRow ? (
                  <textarea rows={2} value={values[f.id] ?? ""} onChange={(e) => set(e.target.value)} />
                ) : (
                  <input value={values[f.id] ?? ""} onChange={(e) => set(e.target.value)} />
                )}
              </label>
            );
          })}
        </fieldset>

        <label className="wide">
          Layout (JSON). Areas are inclusive "column,row to column,row", counting from 0,0 at the top left.
          <textarea className="code" rows={16} value={layoutText} onChange={(e) => editLayout(e.target.value)} />
        </label>
        {(jsonError || layoutErrors.length > 0) && (
          <ul className="errors wide">
            {jsonError && <li>Not valid JSON: {jsonError}</li>}
            {layoutErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <label>
          Cell type
          <select value={cellType} onChange={(e) => changeCellType(e.target.value as CellType)}>
            {CELL_TYPES.map((t) => (
              <option key={t} value={t}>
                {CELL_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Colour
          <span className="colours">
            <input type="color" value={colour} onChange={(e) => setColour(e.target.value)} />
            {COLOUR_PRESETS.map((p) => (
              <button
                key={p.value}
                className="swatch"
                title={p.label}
                aria-label={p.label}
                style={{ background: p.value }}
                onClick={() => setColour(p.value)}
              />
            ))}
          </span>
        </label>
        {cellType === "segment" && (
          <label>
            Segments
            <select value={segments} onChange={(e) => setSegments(Number(e.target.value) as 7 | 14)}>
              <option value={14}>14 (letters and digits)</option>
              <option value={7}>7 (digits)</option>
            </select>
          </label>
        )}
        {cellType === "splitflap" && (
          <>
            <label>
              Typeface
              <select value={fontId} onChange={(e) => setFontId(e.target.value)}>
                {FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Flap stack
              <select value={stackName} onChange={(e) => setStackName(e.target.value as CharsetName)}>
                {Object.keys(CHARSETS).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <Slider label="Flip time" unit="ms" value={flipMs} min={30} max={400} step={10} onChange={setFlipMs} />
          </>
        )}
        <Slider label="Cell width" unit="px" value={cellWidth} min={16} max={120} onChange={setCellWidth} />
        <Slider label="Cell height" unit="px" value={cellHeight} min={24} max={180} onChange={setCellHeight} />
        <Slider label="Volume" value={Math.round(volume * 100)} unit="%" min={0} max={100} onChange={(v) => setVolume(v / 100)} />
      </section>
    </main>
  );
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {props.label}: {props.value}
      {props.unit}
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

function DataStatus({ data, name, missing }: { data: ReturnType<typeof useBoardData>; name?: string; missing: string[] }) {
  const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString() : "");
  let text: string;
  let kind = "ok";
  if (data.error && data.rows.length === 0) {
    text = data.error;
    kind = "error";
  } else if (data.error) {
    text = `Showing the rows from ${time(data.fetchedAt)}: ${data.error}`;
    kind = "error";
  } else if (!data.fetchedAt) {
    text = "Fetching data…";
  } else if (data.stale) {
    text = `The database cannot be reached, so the board is showing the rows from ${time(data.fetchedAt)}.`;
    kind = "error";
  } else {
    text = `${name ?? "Data"}: ${data.rows.length} row${data.rows.length === 1 ? "" : "s"}, read at ${time(data.fetchedAt)}, checked every ${data.refreshSeconds} seconds.`;
  }
  return (
    <div className={`notice wide ${kind}`}>
      {text}
      {missing.length > 0 && (
        <div>
          The data has no column called {missing.map((c) => `"${c}"`).join(", ")}. Check the spelling in the layout's text templates.
        </div>
      )}
    </div>
  );
}

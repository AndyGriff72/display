import { useEffect, useMemo, useState } from "react";
import { listDataSources, type SavedDataSource } from "../api/dataSources";
import { flapSound } from "../audio/flapSound";
import { bindFields, templateColumns, type Row } from "../board/binding";
import { Board } from "../board/Board";
import {
  CELL_TYPES,
  DEFAULT_PAGE_SECONDS,
  parseArea,
  validateLayout,
  type BoardLayout,
  type CellType,
} from "../board/layout";
import { useBoardData } from "../board/useBoardData";
import { CHARSETS, type CharsetName } from "../cells/charsets";
import { FONTS, loadFont } from "../fonts";
import { SAMPLE_RECORDS, SAMPLES, type LayoutShape } from "./boardSamples";

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

/** Where the board's records come from, besides a saved data source. */
const BUILT_IN = "__sample__";
const TYPED = "__typed__";

const playFlap = () => flapSound.play();

export default function BoardEditorPage() {
  const [layoutText, setLayoutText] = useState(() => JSON.stringify(SAMPLES[0].layout, null, 2));
  const [shape, setShape] = useState<LayoutShape>(SAMPLES[0].layout);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [showAreas, setShowAreas] = useState(false);
  const [dataSources, setDataSources] = useState<SavedDataSource[]>([]);
  // The built-in sample records, typed text, or (when the layout names one) a saved data source.
  const [feed, setFeed] = useState<typeof BUILT_IN | typeof TYPED>(BUILT_IN);
  const [page, setPage] = useState(0);

  const [cellType, setCellType] = useState<CellType>("splitflap");
  const [colour, setColour] = useState(DEFAULT_COLOURS.splitflap);
  const [segments, setSegments] = useState<7 | 14>(14);
  const [cellWidth, setCellWidth] = useState(SAMPLES[0].cellWidth);
  const [cellHeight, setCellHeight] = useState(SAMPLES[0].cellHeight);
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
  const records: Row[] = shape.dataSource ? data.rows : feed === BUILT_IN ? SAMPLE_RECORDS : [];
  const usingData = !!shape.dataSource || feed === BUILT_IN;
  const fields = shape.fields ?? [];
  const bound = (f: { text?: unknown }) => usingData && typeof f.text === "string";

  // Move on a page every pageSeconds. Lists only move when they have more records than rows.
  const pageSeconds = typeof shape.pageSeconds === "number" ? shape.pageSeconds : DEFAULT_PAGE_SECONDS;
  useEffect(() => {
    setPage(0);
    if (!(pageSeconds > 0)) return;
    const timer = window.setInterval(() => setPage((p) => p + 1), pageSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [pageSeconds, shape.dataSource, feed]);

  // Bound fields take their text from the records; the rest keep what was typed.
  const boardValues = useMemo(
    () =>
      usingData ? { ...values, ...bindFields(fields.filter(bound), records, shape.pageFields ? page : undefined) } : values,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shape, values, records, page, usingData]
  );

  // Columns the templates use that the data does not have: almost always a typing mistake.
  const missingColumns = useMemo(() => {
    if (!shape.dataSource || data.columns.length === 0) return [];
    const have = new Set(data.columns);
    const templates = [
      ...fields.filter(bound).map((f) => f.text as string),
      ...(shape.lists ?? []).flatMap((l) => (Array.isArray(l.columns) ? l.columns.map((c) => String(c.text ?? "")) : [])),
    ];
    return [...new Set(templates.flatMap(templateColumns))].filter((c) => !have.has(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, data.columns]);

  const replaceShape = (next: LayoutShape) => {
    setShape(next);
    setLayoutText(JSON.stringify(next, null, 2));
    setJsonError(null);
  };

  const chooseFeed = (value: string) => {
    const { dataSource: _old, ...rest } = shape;
    if (value === BUILT_IN || value === TYPED) {
      setFeed(value);
      replaceShape(rest);
    } else {
      replaceShape({ ...rest, dataSource: value });
    }
  };

  const loadSample = (id: string) => {
    const sample = SAMPLES.find((s) => s.id === id);
    if (!sample) return;
    replaceShape(shape.dataSource ? { ...sample.layout, dataSource: shape.dataSource } : sample.layout);
    setCellWidth(sample.cellWidth);
    setCellHeight(sample.cellHeight);
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

  return (
    <main className="app">
      <div className="board-wrap">
        <Board layout={layout} values={boardValues} records={records} page={page} onFlap={playFlap} showAreas={showAreas} />
      </div>

      <section className="controls">
        <label>
          Start from a sample
          <select value="" onChange={(e) => loadSample(e.target.value)}>
            <option value="">Choose…</option>
            {SAMPLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Data
          <select value={shape.dataSource ?? feed} onChange={(e) => chooseFeed(e.target.value)}>
            <option value={BUILT_IN}>Built-in sample departures</option>
            <option value={TYPED}>None: show the text typed below</option>
            {dataSources.map((s) => (
              <option key={s.uuid} value={s.uuid}>
                {s.name}
              </option>
            ))}
            {shape.dataSource && !source && <option value={shape.dataSource}>Unknown data source</option>}
          </select>
        </label>
        {shape.dataSource && <DataStatus data={data} name={source?.name} missing={missingColumns} />}
        {usingData && (
          <p className="hint wide">
            {pageSeconds > 0
              ? `Pages of records change every ${pageSeconds} seconds${shape.pageFields ? ", for fields as well as lists" : ""}.`
              : "Paging is off: the first page of records stays up."}
          </p>
        )}

        <div className="buttons wide">
          <button onClick={toggleSound}>{soundOn ? "Sound off" : "Sound on"}</button>
          <label className="check">
            <input type="checkbox" checked={showAreas} onChange={(e) => setShowAreas(e.target.checked)} />
            Outline areas
          </label>
        </div>

        {fields.length > 0 && (
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
                    <span className="hint">shows: {boardValues[f.id] ? `"${boardValues[f.id]}"` : "nothing"}</span>
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
        )}

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

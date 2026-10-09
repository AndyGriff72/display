import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deleteBoard, getBoard, listBoards, saveBoard, type BoardSummary } from "../api/boards";
import { apiError } from "../api/client";
import { listDataSources, type SavedDataSource } from "../api/dataSources";
import { DEFAULT_SOUND_STYLE, flapSound, SOUND_STYLE_LABELS, SOUND_STYLES, type SoundStyle } from "../audio/flapSound";
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
import { usePaging } from "../board/usePaging";
import { CHARSETS, type CharsetName } from "../cells/charsets";
import { normalizeStack } from "../cells/splitflap/flapStack";
import { FONTS, loadFont } from "../fonts";
import { SAMPLE_RECORDS, SAMPLES, type LayoutShape } from "./boardSamples";
import { AreasPanel } from "./AreasPanel";
import { StaticAreasPanel } from "./StaticAreasPanel";

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

/** What is compared to tell whether a board has unsaved changes. */
const snapshot = (name: string, layout: BoardLayout) => JSON.stringify({ name, layout });

export default function BoardEditorPage() {
  const params = useParams();
  const boardId = params.id ? Number(params.id) : undefined;
  const navigate = useNavigate();
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [name, setName] = useState("");
  // The board as last saved or opened, to compare against; null for a board never saved.
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  // Set when a board has just been opened: its snapshot is taken once the controls show it.
  const pendingSnapshot = useRef<string | null>(null);
  // The board the editor already shows, so saving a new board does not reload it. Starts as
  // "nothing yet", so the first render always opens whatever the address names.
  const shownId = useRef<number | undefined | null>(null);
  const [boardNotice, setBoardNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const screenKey = boards.find((b) => b.id === boardId)?.uuid;
  const [layoutText, setLayoutText] = useState(() => JSON.stringify(SAMPLES[0].layout, null, 2));
  const [shape, setShape] = useState<LayoutShape>(SAMPLES[0].layout);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [showAreas, setShowAreas] = useState(false);
  const [dataSources, setDataSources] = useState<SavedDataSource[]>([]);
  // The built-in sample records, typed text, or (when the layout names one) a saved data source.
  const [feed, setFeed] = useState<typeof BUILT_IN | typeof TYPED>(BUILT_IN);

  const [cellType, setCellType] = useState<CellType>("splitflap");
  const [colour, setColour] = useState(DEFAULT_COLOURS.splitflap);
  const [segments, setSegments] = useState<7 | 14>(14);
  const [cellWidth, setCellWidth] = useState(SAMPLES[0].cellWidth);
  const [cellHeight, setCellHeight] = useState(SAMPLES[0].cellHeight);
  const [flipMs, setFlipMs] = useState(80);
  const [fontId, setFontId] = useState(FONTS[0].id);
  const [stackName, setStackName] = useState<CharsetName>("standard");
  // Saved with the board: whether it makes the flap sound, here and on screens.
  const [soundOn, setSoundOn] = useState(false);
  const [soundStyle, setSoundStyle] = useState<SoundStyle>(DEFAULT_SOUND_STYLE);
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
  // A field with text always shows it: its columns filled from the records when there are
  // any, and any fixed text as it is. Only fields without text show what is typed below.
  const bound = (f: { text?: unknown }) => typeof f.text === "string";

  // Move on a page every pageSeconds. Lists only move when they have more records than rows.
  const pageSeconds = typeof shape.pageSeconds === "number" ? shape.pageSeconds : DEFAULT_PAGE_SECONDS;
  const page = usePaging(shape.pageSeconds, (shape.dataSource ?? "") + "|" + feed);

  // Bound fields take their text from the records; the rest keep what was typed.
  const boardValues = useMemo(
    () => ({ ...values, ...bindFields(fields.filter(bound), records, shape.pageFields ? page : undefined) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shape, values, records, page]
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

  // Everything that is saved: the layout, its appearance and the screens' sound.
  const fullLayout: BoardLayout = useMemo(
    () => ({ ...layout, sound: { enabled: soundOn, volume, style: soundStyle } }),
    [layout, soundOn, volume, soundStyle]
  );
  const current = snapshot(name.trim(), fullLayout);
  const dirty = savedSnapshot === null || current !== savedSnapshot;

  /** Show a layout in the editor: its structure in the JSON, its appearance in the controls. */
  const applyLayout = (l: BoardLayout) => {
    const { cell, sound, ...rest } = l;
    replaceShape(rest);
    setFeed(BUILT_IN);
    setCellType(cell.type);
    setColour(cell.color ?? DEFAULT_COLOURS[cell.type]);
    setSegments(cell.segments ?? 14);
    setCellWidth(cell.width);
    setCellHeight(cell.height);
    setFlipMs(cell.flipMs ?? 80);
    setFontId(FONTS.find((f) => f.family === cell.fontFamily)?.id ?? FONTS[0].id);
    setStackName(
      (Object.keys(CHARSETS) as CharsetName[]).find((k) => cell.stack !== undefined && CHARSETS[k] === normalizeStack(cell.stack)) ??
        "standard"
    );
    setSoundOn(!!sound?.enabled);
    setSoundStyle(sound?.style && SOUND_STYLES.includes(sound.style) ? sound.style : DEFAULT_SOUND_STYLE);
    setVolume(sound?.volume ?? 0.5);
  };

  const refreshBoards = () =>
    listBoards()
      .then(setBoards)
      .catch(() => setBoards([]));
  useEffect(() => {
    refreshBoards();
  }, []);

  // Open the board in the address, or start a new one.
  useEffect(() => {
    if (boardId === shownId.current) return;
    shownId.current = boardId;
    setBoardNotice(null);
    if (boardId === undefined) {
      const sample = SAMPLES[0];
      applyLayout({ ...sample.layout, cell: { type: "splitflap", width: sample.cellWidth, height: sample.cellHeight } });
      setName("");
      setSavedSnapshot(null);
      return;
    }
    getBoard(boardId)
      .then((board) => {
        applyLayout(board.layout);
        setName(board.name);
        pendingSnapshot.current = board.name;
      })
      .catch((e) => setBoardNotice({ kind: "error", text: apiError(e).message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  // Once an opened board is showing, remember it as saved.
  useEffect(() => {
    if (pendingSnapshot.current === null) return;
    setSavedSnapshot(snapshot(pendingSnapshot.current.trim(), fullLayout));
    pendingSnapshot.current = null;
  }, [fullLayout]);

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty || savedSnapshot === null) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, savedSnapshot]);

  const save = async (asNew: boolean) => {
    let saveName = name.trim();
    if (asNew) {
      const answer = window.prompt("Name for the new board", saveName ? saveName + " (copy)" : "");
      if (answer === null) return;
      saveName = answer.trim();
    }
    if (!saveName) {
      setBoardNotice({ kind: "error", text: "Give the board a name before saving it." });
      return;
    }
    if (layoutErrors.length > 0 || jsonError) {
      setBoardNotice({ kind: "error", text: "Fix the problems listed under the layout before saving." });
      return;
    }
    try {
      const res = await saveBoard(saveName, fullLayout, asNew ? undefined : boardId);
      setName(res.data.name);
      setSavedSnapshot(snapshot(res.data.name, fullLayout));
      setBoardNotice({ kind: "ok", text: res.message });
      refreshBoards();
      if (res.data.id !== boardId) {
        shownId.current = res.data.id;
        navigate("/boards/" + res.data.id);
      }
    } catch (e) {
      setBoardNotice({ kind: "error", text: apiError(e).message });
    }
  };

  const remove = async () => {
    if (boardId === undefined || !window.confirm('Delete "' + name + '"? Screens showing it will stop.')) return;
    try {
      await deleteBoard(boardId);
      refreshBoards();
      navigate("/");
    } catch (e) {
      setBoardNotice({ kind: "error", text: apiError(e).message });
    }
  };

  const openBoard = (value: string) => {
    if (dirty && savedSnapshot !== null && !window.confirm("Leave this board without saving your changes?")) return;
    navigate(value ? "/boards/" + value : "/");
  };

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

  // Whether the browser is holding the sound back until this page is clicked or typed on.
  const soundHeldBack = useSyncExternalStore(
    (listener) => flapSound.subscribe(listener),
    () => flapSound.heldBack
  );

  // The board's sound setting, heard here as it will be on screens.
  useEffect(() => {
    if (soundOn) flapSound.enable();
    else flapSound.disable();
  }, [soundOn]);
  useEffect(() => () => flapSound.disable(), []);
  useEffect(() => flapSound.setStyle(soundStyle), [soundStyle]);

  return (
    <main className="app">
      <div className="board-bar">
        <select value={boardId ?? ""} onChange={(e) => openBoard(e.target.value)} aria-label="Open a board">
          <option value="">New board</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Board name" aria-label="Board name" />
        <button className="primary" onClick={() => save(false)}>
          Save
        </button>
        <button onClick={() => save(true)}>Save as new…</button>
        {boardId !== undefined && (
          <button className="danger" onClick={remove}>
            Delete
          </button>
        )}
        <span className="hint">{savedSnapshot === null ? "Not saved yet" : dirty ? "Unsaved changes" : "Saved"}</span>
        {screenKey && (
          <a className="screen-link" href={"/screen/" + screenKey} target="_blank" rel="noreferrer" title="Screens show the board as last saved">
            Open as a screen ↗
          </a>
        )}
      </div>
      {boardNotice && <p className={"notice board-notice " + boardNotice.kind}>{boardNotice.text}</p>}

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
          <Switch checked={soundOn} onChange={setSoundOn} label="Flap sound" />
          <select value={soundStyle} onChange={(e) => setSoundStyle(e.target.value as SoundStyle)} aria-label="Sound style">
            {SOUND_STYLES.map((s) => (
              <option key={s} value={s}>
                {SOUND_STYLE_LABELS[s]}
              </option>
            ))}
          </select>
          <button onClick={() => flapSound.audition()}>Hear it</button>

          <label className="check">
            <input type="checkbox" checked={showAreas} onChange={(e) => setShowAreas(e.target.checked)} />
            Outline areas
          </label>
          <label className="check" title="Positions outside every field, list and static area">
            <input
              type="checkbox"
              checked={shape.unusedCells === "blank"}
              onChange={(e) => {
                const { unusedCells: _old, ...rest } = shape;
                replaceShape(e.target.checked ? { ...rest, unusedCells: "blank" } : rest);
              }}
            />
            Blank cells in unused positions
          </label>
        </div>
        {soundHeldBack && (
          <p className="hint wide sound-held">
            Your browser is holding the sound back until you click or press a key on this page. Screens do the same unless sound is
            allowed for this site.
          </p>
        )}

        {fields.length > 0 && (
          <fieldset className="wide">
            <legend>Fields</legend>
            {fields.some((f) => !bound(f)) && (
              <p className="hint wide">
                Text typed into these boxes is for trying the board out and is not saved. For text that is saved, give the
                field a "text" in the layout: fixed words, or columns from the data in braces.
              </p>
            )}
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

        <AreasPanel
          fields={shape.fields ?? []}
          lists={shape.lists ?? []}
          boardType={cellType}
          boardColour={colour}
          cellHeight={cellHeight}
          onChange={({ fields, lists }) => replaceShape({ ...shape, ...(shape.fields ? { fields } : {}), ...(shape.lists ? { lists } : {}) })}
        />

        <StaticAreasPanel statics={shape.statics ?? []} cellHeight={cellHeight} onChange={(statics) => replaceShape({ ...shape, statics })} />

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

/** An on/off switch: a checkbox drawn as a sliding toggle. */
function Switch({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden />
      {label}
    </label>
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

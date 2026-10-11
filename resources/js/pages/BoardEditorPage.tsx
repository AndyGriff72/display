import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deleteBoard, getBoard, listBoards, saveBoard, type BoardSummary } from "../api/boards";
import { apiError } from "../api/client";
import { listDataSources, type SavedDataSource } from "../api/dataSources";
import { DEFAULT_SOUND_STYLE, flapSound, SOUND_STYLE_LABELS, SOUND_STYLES, type SoundStyle } from "../audio/flapSound";
import { bindFields, templateColumns, type Row } from "../board/binding";
import { Board } from "../board/Board";
import {
  DEFAULT_PAGE_SECONDS,
  DEFAULT_LINE_HEIGHT,
  FINISH_COLOURS,
  validateLayout,
  type BoardLayout,
  type CellType,
  type Finish,
  type TextStyle,
} from "../board/layout";
import { useBoardData } from "../board/useBoardData";
import { usePaging } from "../board/usePaging";
import { CHARSETS, type CharsetName } from "../cells/charsets";
import { normalizeStack } from "../cells/splitflap/flapStack";
import { FONTS, loadFont } from "../fonts";
import { SAMPLE_RECORDS, SAMPLES, type LayoutShape } from "./boardSamples";
import { OptionalColour, StaticAreasPanel } from "./StaticAreasPanel";
import { CELL_LOOKS, lookById, lookId } from "./cellLooks";
import { AreasEditor } from "./editor/AreasEditor";
import { TextStyleButtons } from "./editor/TextStyleButtons";

/** Each cell type starts in the colour it is best known in. */
const DEFAULT_COLOURS: Record<CellType, string> = {
  splitflap: "#f3efe2",
  dotmatrix: "#ffb000",
  segment: "#ff3b1f",
  flipdot: "#ffd21f",
  text: "#f3efe2",
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
const NO_DATA = "__none__";

/** The drawer's tabs: the board as a whole, its areas, its static areas, and the raw layout. */
const TABS = [
  { id: "board", label: "Board" },
  { id: "areas", label: "Areas" },
  { id: "statics", label: "Static areas" },
  { id: "advanced", label: "Advanced" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const playFlap = () => flapSound.play();
const playDotFlips = (delaysMs: number[]) => flapSound.dotFlips(delaysMs);

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
  const [showAreas, setShowAreas] = useState(false);
  const [tab, setTab] = useState<Tab>("board");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [dataSources, setDataSources] = useState<SavedDataSource[]>([]);
  // The built-in sample records, no data, or (when the layout names one) a saved data source.
  const [feed, setFeed] = useState<typeof BUILT_IN | typeof NO_DATA>(BUILT_IN);

  const [cellType, setCellType] = useState<CellType>("splitflap");
  const [colour, setColour] = useState(DEFAULT_COLOURS.splitflap);
  const [segments, setSegments] = useState<7 | 14>(14);
  const [finish, setFinish] = useState<Finish>("led");
  // A text board's own text settings; unset means the defaults (see resolveText).
  const [textSize, setTextSize] = useState<number | undefined>(undefined);
  const [textBackground, setTextBackground] = useState<string | undefined>(undefined);
  const [letterSpacing, setLetterSpacing] = useState<number | undefined>(undefined);
  const [lineHeight, setLineHeight] = useState<number | undefined>(undefined);
  const [textStyle, setTextStyle] = useState<TextStyle>({});
  const [cellWidth, setCellWidth] = useState(SAMPLES[0].cellWidth);
  const [cellHeight, setCellHeight] = useState(SAMPLES[0].cellHeight);
  // The gaps between cells, across and down; unset means the usual proportion of the cell.
  const [gapX, setGapX] = useState<number | undefined>(undefined);
  const [gapY, setGapY] = useState<number | undefined>(undefined);
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
  const fields = shape.fields ?? [];
  const bound = (f: { text?: unknown }) => typeof f.text === "string";

  // Move on a page every pageSeconds. Lists only move when they have more records than rows.
  const pageSeconds = typeof shape.pageSeconds === "number" ? shape.pageSeconds : DEFAULT_PAGE_SECONDS;
  const page = usePaging(shape.pageSeconds, (shape.dataSource ?? "") + "|" + feed);

  // Each field's text: fixed words as they are, columns in braces filled from the records.
  const boardValues = useMemo(
    () => bindFields(fields.filter(bound), records, shape.pageFields ? page : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shape, records, page]
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
    if (value === BUILT_IN || value === NO_DATA) {
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
    changeLook(lookId(sample.cellType ?? "splitflap", sample.finish));
    setGapX(sample.gapX);
    setGapY(sample.gapY);
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
        ...(gapX !== undefined ? { gapX } : {}),
        ...(gapY !== undefined ? { gapY } : {}),
        color: colour,
        fontFamily: font.family,
        stack: CHARSETS[stackName],
        flipMs,
        segments,
        ...(finish !== "led" ? { finish } : {}),
        ...(cellType === "text"
          ? {
              ...(textSize !== undefined ? { fontSize: textSize } : {}),
              ...(textBackground ? { background: textBackground } : {}),
              ...(letterSpacing ? { letterSpacing } : {}),
              ...(lineHeight !== undefined ? { lineHeight } : {}),
              ...(textStyle.bold ? { bold: true } : {}),
              ...(textStyle.italic ? { italic: true } : {}),
              ...(textStyle.underline ? { underline: true } : {}),
            }
          : {}),
      },
    }),
    [shape, cellType, cellWidth, cellHeight, gapX, gapY, colour, font, stackName, flipMs, segments, finish, textSize, textBackground, letterSpacing, lineHeight, textStyle]
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
    setFinish(cell.finish ?? "led");
    setTextSize(cell.fontSize);
    setTextBackground(cell.background);
    setLetterSpacing(cell.letterSpacing);
    setLineHeight(cell.lineHeight);
    setTextStyle({ bold: cell.bold, italic: cell.italic, underline: cell.underline });
    setCellWidth(cell.width);
    setCellHeight(cell.height);
    setGapX(cell.gapX);
    setGapY(cell.gapY);
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

  /** Choose from the one list of cell types and finishes (see cellLooks.ts). */
  const changeLook = (id: string) => {
    const look = lookById(id);
    if (!look) return;
    const next = look.finish ?? "led";
    setCellType(look.type);
    setFinish(next);
    setColour(FINISH_COLOURS[next] ?? DEFAULT_COLOURS[look.type]);
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

  const setShapeKey = <K extends keyof LayoutShape>(key: K, value: LayoutShape[K] | undefined) => {
    const { [key]: _old, ...rest } = shape;
    replaceShape((value === undefined ? rest : { ...rest, [key]: value }) as unknown as LayoutShape);
  };
  const problems = [...(jsonError ? [`The layout is not valid JSON: ${jsonError}`] : []), ...layoutErrors];

  return (
    <main className={`editor${drawerOpen ? " with-drawer" : ""}`}>
      <section className="editor-main">
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
          {!drawerOpen && (
            <button className="drawer-show" onClick={() => setDrawerOpen(true)}>
              Settings ‹
            </button>
          )}
        </div>
        {boardNotice && <p className={"notice " + boardNotice.kind}>{boardNotice.text}</p>}

        <FitToWidth>
          <Board layout={layout} values={boardValues} records={records} page={page} onFlap={playFlap} onDotFlips={playDotFlips} showAreas={showAreas} />
        </FitToWidth>

        <div className="preview-tools">
          <label className="check">
            <input type="checkbox" checked={showAreas} onChange={(e) => setShowAreas(e.target.checked)} />
            Outline areas
          </label>
        </div>
        {problems.length > 0 && (
          <ul className="errors">
            {problems.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </section>

      {drawerOpen && (
        <aside className="drawer" aria-label="Board settings">
          <div className="drawer-head">
            <div className="tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
            <button className="icon" title="Hide the settings" onClick={() => setDrawerOpen(false)}>
              »
            </button>
          </div>

          <div className="drawer-body controls">
            {tab === "board" && (
              <>
                <fieldset>
                  <legend>Start</legend>
                  <label>
                    Start from a sample
                    <select value="" onChange={(e) => loadSample(e.target.value)}>
                      <option value="">Choose…</option>
                      {SAMPLES.map((sm) => (
                        <option key={sm.id} value={sm.id}>
                          {sm.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </fieldset>

                <fieldset>
                  <legend>Size</legend>
                  <div className="row-editor">
                    <label className="inline">
                      Columns
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={shape.columns}
                        onChange={(e) => e.target.value !== "" && setShapeKey("columns", Math.max(1, Number(e.target.value)))}
                        style={{ width: 70 }}
                      />
                    </label>
                    <label className="inline">
                      Rows
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={shape.rows}
                        onChange={(e) => e.target.value !== "" && setShapeKey("rows", Math.max(1, Number(e.target.value)))}
                        style={{ width: 70 }}
                      />
                    </label>
                  </div>
                  <Slider label="Cell width" unit="px" value={cellWidth} min={16} max={120} onChange={setCellWidth} />
                  <Slider label="Cell height" unit="px" value={cellHeight} min={24} max={180} onChange={setCellHeight} />
                  <Slider label="Gap across" unit="px" value={gapX ?? Math.round(cellWidth * 0.08)} min={0} max={40} onChange={setGapX} />
                  <Slider label="Gap down" unit="px" value={gapY ?? Math.round(cellHeight * 0.12)} min={0} max={40} onChange={setGapY} />
                </fieldset>

                <fieldset>
                  <legend>Cells</legend>
                  <label>
                    Cell type
                    <select value={lookId(cellType, finish)} onChange={(e) => changeLook(e.target.value)}>
                      {CELL_LOOKS.map((look) => (
                        <option key={look.id} value={look.id}>
                          {look.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Colour
                    <span className="colours">
                      <input type="color" value={colour} onChange={(e) => setColour(e.target.value)} />
                      {COLOUR_PRESETS.map((pr) => (
                        <button
                          key={pr.value}
                          className="swatch"
                          title={pr.label}
                          aria-label={pr.label}
                          style={{ background: pr.value }}
                          onClick={() => setColour(pr.value)}
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
                  {(cellType === "splitflap" || cellType === "text") && (
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
                  )}
                  {cellType === "text" && (
                    <>
                      <Slider label="Text size" unit="px" value={textSize ?? Math.round(cellHeight * 0.6)} min={6} max={200} onChange={setTextSize} />
                      <div className="labelled-control">
                        <span>Style</span>
                        <TextStyleButtons value={textStyle} onChange={(patch) => setTextStyle({ ...textStyle, ...patch })} />
                      </div>
                      <OptionalColour label="Background behind the text" value={textBackground} fallback="#1b1b1d" onChange={setTextBackground} />
                      <Slider label="Letter spacing" unit="px" value={letterSpacing ?? 0} min={-4} max={30} onChange={setLetterSpacing} />
                      <Slider label="Line spacing" unit="×" value={lineHeight ?? DEFAULT_LINE_HEIGHT} min={0.8} max={3} step={0.05} onChange={setLineHeight} />
                    </>
                  )}
                  {cellType === "splitflap" && (
                    <>
                      <label>
                        Flap stack
                        <select value={stackName} onChange={(e) => setStackName(e.target.value as CharsetName)}>
                          {Object.keys(CHARSETS).map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Slider label="Flip time" unit="ms" value={flipMs} min={30} max={400} step={10} onChange={setFlipMs} />
                    </>
                  )}
                  <label className="check" title="Positions outside every field, list and static area, including gaps between list columns">
                    <input type="checkbox" checked={shape.unusedCells === "blank"} onChange={(e) => setShapeKey("unusedCells", e.target.checked ? "blank" : undefined)} />
                    Blank cells in unused positions
                  </label>
                </fieldset>

                <fieldset>
                  <legend>Data</legend>
                  <label>
                    Data
                    <select value={shape.dataSource ?? feed} onChange={(e) => chooseFeed(e.target.value)}>
                      <option value={BUILT_IN}>Built-in sample departures</option>
                      <option value={NO_DATA}>No data</option>
                      {dataSources.map((ds) => (
                        <option key={ds.uuid} value={ds.uuid}>
                          {ds.name}
                        </option>
                      ))}
                      {shape.dataSource && !source && <option value={shape.dataSource}>Unknown data source</option>}
                    </select>
                  </label>
                  {shape.dataSource && <DataStatus data={data} name={source?.name} missing={missingColumns} />}
                  <label className="inline" title="When there are more records than fit, show the next lot after this long. 0 keeps the first lot up.">
                    Next page of records every
                    <input
                      type="number"
                      min={0}
                      max={3600}
                      value={pageSeconds}
                      onChange={(e) => e.target.value !== "" && setShapeKey("pageSeconds", Math.max(0, Number(e.target.value)))}
                      style={{ width: 64 }}
                    />
                    seconds
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={!!shape.pageFields} onChange={(e) => setShapeKey("pageFields", e.target.checked || undefined)} />
                    Page fields too (one record per page)
                  </label>
                </fieldset>

                <fieldset>
                  <legend>Sound</legend>
                  <div className="buttons">
                    <Switch checked={soundOn} onChange={setSoundOn} label="Flap sound" />
                    <select value={soundStyle} onChange={(e) => setSoundStyle(e.target.value as SoundStyle)} aria-label="Sound style">
                      {SOUND_STYLES.map((st) => (
                        <option key={st} value={st}>
                          {SOUND_STYLE_LABELS[st]}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => flapSound.audition()}>Hear it</button>
                  </div>
                  <Slider label="Volume" value={Math.round(volume * 100)} unit="%" min={0} max={100} onChange={(v) => setVolume(v / 100)} />
                  {soundHeldBack && (
                    <p className="hint sound-held">
                      Your browser is holding the sound back until you click or press a key on this page. Screens do the same unless sound
                      is allowed for this site.
                    </p>
                  )}
                </fieldset>
              </>
            )}

            {tab === "areas" && (
              <AreasEditor
                fields={shape.fields ?? []}
                lists={shape.lists ?? []}
                columns={shape.columns}
                rows={shape.rows}
                boardType={cellType}
                boardFinish={finish}
                boardColour={colour}
                cellHeight={cellHeight}
                boardTextStyle={cellType === "text" ? textStyle : undefined}
                dataColumns={shape.dataSource ? data.columns : feed === BUILT_IN ? Object.keys(SAMPLE_RECORDS[0] ?? {}) : []}
                showing={boardValues}
                onChange={({ fields: f, lists: l }) => replaceShape({ ...shape, fields: f, lists: l })}
              />
            )}

            {tab === "statics" && (
              <StaticAreasPanel
                statics={shape.statics ?? []}
                cellHeight={cellHeight}
                columns={shape.columns}
                rows={shape.rows}
                onChange={(statics) => replaceShape({ ...shape, statics })}
              />
            )}

            {tab === "advanced" && (
              <label>
                <span>
                  The board's definition, for editing by hand. Areas are "column,row to column,row", counting from 0,0 at the top left.
                  The board's appearance (cell type, colours, sizes) is set on the Board tab.
                </span>
                <textarea className="code" rows={28} value={layoutText} onChange={(e) => editLayout(e.target.value)} spellCheck={false} />
              </label>
            )}
          </div>
        </aside>
      )}
    </main>
  );
}

/**
 * The board, scaled down (never up) to the width available beside the drawer, so the whole of
 * it stays in view while it is being edited.
 */
function FitToWidth({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, height: 0, left: 0 });

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const scale = Math.min(1, o.clientWidth / Math.max(1, i.offsetWidth));
      setFit({ scale, height: i.offsetHeight * scale, left: Math.max(0, (o.clientWidth - i.offsetWidth * scale) / 2) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(o);
    observer.observe(i);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outer} className="fit-preview" style={{ height: fit.height || undefined }}>
      <div ref={inner} className="fit-preview-inner" style={{ transform: `scale(${fit.scale})`, left: fit.left }}>
        {children}
      </div>
    </div>
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

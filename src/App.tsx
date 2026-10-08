import { useEffect, useMemo, useState } from "react";
import { flapSound } from "./audio/flapSound";
import { Board } from "./board/Board";
import { parseArea, validateLayout, type BoardLayout } from "./board/layout";
import { CHARSETS, type CharsetName } from "./cells/charsets";
import { FONTS, loadFont } from "./fonts";

/** The layout's structure. Cell appearance comes from the controls below the editor. */
type LayoutShape = Omit<BoardLayout, "cell">;

const SAMPLE_LAYOUT: LayoutShape = {
  columns: 24,
  rows: 4,
  statics: [{ id: "logo", area: "0,0 to 3,3" }],
  fields: [
    { id: "time", area: "4,0 to 8,0" },
    { id: "destination", area: "10,0 to 23,0" },
    { id: "calling", area: "4,1 to 23,2" },
    { id: "platform", area: "4,3 to 14,3" },
    { id: "status", area: "15,3 to 23,3", align: "right" },
  ],
};

const DEPARTURES: Record<string, string>[] = [
  { time: "14:32", destination: "LONDON EUSTON", calling: "CREWE, STAFFORD,\nMILTON KEYNES", platform: "PLATFORM 4", status: "ON TIME" },
  { time: "14:47", destination: "MANCHESTER", calling: "WARRINGTON BANK QUAY", platform: "PLATFORM 11", status: "DELAYED" },
  { time: "15:05", destination: "EDINBURGH", calling: "CARLISLE,\nLOCKERBIE", platform: "PLATFORM 2", status: "BOARDING" },
  { time: "15:20", destination: "GLASGOW", calling: "PRESTON, LANCASTER,\nOXENHOLME, PENRITH", platform: "PLATFORM 9", status: "CANCELLED" },
];

const playFlap = () => flapSound.play();

export default function App() {
  const [layoutText, setLayoutText] = useState(() => JSON.stringify(SAMPLE_LAYOUT, null, 2));
  const [shape, setShape] = useState<LayoutShape>(SAMPLE_LAYOUT);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [values, setValues] = useState(DEPARTURES[0]);
  const [departure, setDeparture] = useState(0);
  const [showAreas, setShowAreas] = useState(true);

  const [cellWidth, setCellWidth] = useState(32);
  const [cellHeight, setCellHeight] = useState(50);
  const [flipMs, setFlipMs] = useState(80);
  const [fontId, setFontId] = useState(FONTS[0].id);
  const [stackName, setStackName] = useState<CharsetName>("standard");
  const [soundOn, setSoundOn] = useState(false);
  const [volume, setVolume] = useState(0.5);

  const font = FONTS.find((f) => f.id === fontId) ?? FONTS[0];
  useEffect(() => loadFont(font), [font]);
  useEffect(() => flapSound.setVolume(volume), [volume]);

  const layout: BoardLayout = useMemo(
    () => ({
      ...shape,
      cell: {
        type: "splitflap",
        width: cellWidth,
        height: cellHeight,
        fontFamily: font.family,
        stack: CHARSETS[stackName],
        flipMs,
      },
    }),
    [shape, cellWidth, cellHeight, font, stackName, flipMs]
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
        <Board layout={layout} values={values} onFlap={playFlap} showAreas={showAreas} />
      </div>

      <section className="controls">
        <div className="buttons wide">
          <button onClick={nextDeparture}>Next departure</button>
          <button onClick={toggleSound}>{soundOn ? "Sound off" : "Sound on"}</button>
          <label className="check">
            <input type="checkbox" checked={showAreas} onChange={(e) => setShowAreas(e.target.checked)} />
            Outline areas
          </label>
        </div>

        <fieldset className="wide">
          <legend>Fields</legend>
          {(shape.fields ?? []).map((f) => {
            const rect = parseArea(f.area ?? "");
            const multiRow = !!rect && rect.y2 > rect.y1;
            const set = (v: string) => setValues((old) => ({ ...old, [f.id]: v }));
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
        <Slider label="Cell width" unit="px" value={cellWidth} min={16} max={120} onChange={setCellWidth} />
        <Slider label="Cell height" unit="px" value={cellHeight} min={24} max={180} onChange={setCellHeight} />
        <Slider label="Flip time" unit="ms" value={flipMs} min={30} max={400} step={10} onChange={setFlipMs} />
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

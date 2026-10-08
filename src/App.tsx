import { useEffect, useState } from "react";
import { flapSound } from "./audio/flapSound";
import { CHARSETS, type CharsetName } from "./cells/charsets";
import { SplitFlapCell } from "./cells/splitflap/SplitFlapCell";
import { FONTS, loadFont } from "./fonts";

const SAMPLES = [
  "LONDON EUSTON\nPLATFORM 4  ON TIME\n14:32",
  "MANCHESTER PICC\nPLATFORM 11 DELAYED\n14:47",
  "EDINBURGH\nPLATFORM 2  BOARDING\n15:05",
  "GLASGOW CENTRAL\nPLATFORM 9  CANCELLED\n15:20",
  "BIRMINGHAM NEW ST\nPLATFORM 1  ON TIME\n15:41",
];

const playFlap = () => flapSound.play();

export default function App() {
  const [text, setText] = useState(SAMPLES[0]);
  const [columns, setColumns] = useState(20);
  const [cellWidth, setCellWidth] = useState(36);
  const [cellHeight, setCellHeight] = useState(56);
  const [flipMs, setFlipMs] = useState(80);
  const [fontId, setFontId] = useState(FONTS[0].id);
  const [stackName, setStackName] = useState<CharsetName>("standard");
  const [soundOn, setSoundOn] = useState(false);
  const [volume, setVolume] = useState(0.5);

  const font = FONTS.find((f) => f.id === fontId) ?? FONTS[0];
  useEffect(() => loadFont(font), [font]);
  useEffect(() => flapSound.setVolume(volume), [volume]);

  const toggleSound = async () => {
    if (soundOn) {
      flapSound.disable();
      setSoundOn(false);
    } else {
      await flapSound.enable();
      setSoundOn(true);
    }
  };

  const nextSample = () => {
    const i = SAMPLES.indexOf(text);
    setText(SAMPLES[(i + 1) % SAMPLES.length]);
  };

  // Every row is padded to the full width so cells that are no longer needed flip back to blank.
  const rows = text.split("\n").map((line) => line.padEnd(columns).slice(0, columns));

  return (
    <main className="app">
      <section className="board" style={{ gap: cellHeight * 0.12 }}>
        {rows.map((row, r) => (
          <div className="board-row" key={r} style={{ gap: cellWidth * 0.08 }}>
            {[...row].map((ch, c) => (
              <SplitFlapCell
                key={c}
                char={ch}
                width={cellWidth}
                height={cellHeight}
                fontFamily={font.family}
                stack={CHARSETS[stackName]}
                flipMs={flipMs}
                onFlap={playFlap}
              />
            ))}
          </div>
        ))}
      </section>

      <section className="controls">
        <label className="wide">
          Text (one line per row)
          <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="buttons wide">
          <button onClick={nextSample}>Next departure</button>
          <button onClick={toggleSound}>{soundOn ? "Sound off" : "Sound on"}</button>
        </div>
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
        <Slider label="Columns" value={columns} min={4} max={40} onChange={setColumns} />
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

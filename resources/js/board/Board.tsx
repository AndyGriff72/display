import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { enableBeatTiming } from "../cells/splitflap/beatTiming";
import { FlapClock } from "../cells/splitflap/flapClock";
import { DotMatrixCell } from "../cells/dotmatrix/DotMatrixCell";
import { FlipDotCell } from "../cells/flipdot/FlipDotCell";
import { SegmentCell } from "../cells/segment/SegmentCell";
import { SplitFlapCell } from "../cells/splitflap/SplitFlapCell";
import { WholeValueFlap } from "../cells/splitflap/WholeValueFlap";
import { FONTS, loadFont } from "../fonts";
import type { Row } from "./binding";
import {
  cellSpecs,
  composeBoard,
  drumFaces,
  fontsUsed,
  imageAreas,
  resolveStaticText,
  textBlocks,
  wholeValueFlaps,
  type TextBlock,
  type TextSpec,
  type WholeValueFlap as Flap,
} from "./compose";
import { parseArea, type BoardLayout, type Rect, type StaticArea } from "./layout";
import { TimingReadout } from "./TimingReadout";
import "./Board.css";

export interface BoardProps {
  layout: BoardLayout;
  /** Text for each field, by field id. */
  values: Record<string, string>;
  /** The data source's records, which lists show one per row. */
  records?: Row[];
  /** Which page of records lists show; see pageOffset. */
  page?: number;
  /**
   * Called on each beat that split-flaps land on, with how many landed together, when the beat
   * was due in Date.now() time (see FlapClock), and how many split-flaps the board has.
   */
  onBeat?: (landed: number, dueAt: number, ofTotal: number) => void;
  /** When the board's flaps keep their own time (flapTiming "independent"): called each time one lands. */
  onFlap?: () => void;
  /** Called when flip-dot discs turn, with the delay in milliseconds of each column that turns. */
  onDotFlips?: (delaysMs: number[]) => void;
  /** Outline the static areas and fields, with their ids, for checking a layout. */
  showAreas?: boolean;
}

/**
 * A grid of character cells, each drawn as its area's cell type, with static areas and text
 * areas laid over it. Everything is placed on the same CSS grid, so an area covers the gaps
 * between the cells it replaces and the board keeps its shape around it.
 */
export function Board({ layout, values, records = [], page = 0, onBeat, onFlap, onDotFlips, showAreas }: BoardProps) {
  const { cell } = layout;
  // ?timing in the address: record how the split-flaps keep time, and show it in a corner.
  const [showTiming] = useState(() => {
    const on = new URLSearchParams(window.location.search).has("timing");
    if (on) enableBeatTiming();
    return on;
  });
  const specs = useMemo(() => cellSpecs(layout), [layout]);
  const cells = useMemo(() => composeBoard(layout, values, records, page), [layout, values, records, page]);
  const texts = useMemo(() => textBlocks(layout, values, records, page), [layout, values, records, page]);
  const statics = useMemo(() => placedAreas(layout, layout.statics ?? []), [layout]);
  const flaps = useMemo(() => wholeValueFlaps(layout, values, records, page), [layout, values, records, page]);
  const drums = useDrums(flaps);
  // Every split-flap on the board: what a beat's flaps are measured against.
  const splitFlaps = useMemo(() => [...specs.values()].filter((s) => s.type === "splitflap").length + flaps.length, [specs, flaps]);
  const clockFor = useFlapClocks(layout.cell.flapTiming !== "independent", onBeat, splitFlaps);
  const images = useMemo(() => imageAreas(layout, values, records, page), [layout, values, records, page]);
  const fields = useMemo(
    () => (showAreas ? placedAreas(layout, [...(layout.fields ?? []), ...(layout.lists ?? [])]) : []),
    [layout, showAreas]
  );

  // Every typeface the board uses, whichever areas use them.
  useEffect(() => {
    for (const family of fontsUsed(layout)) {
      const font = FONTS.find((f) => f.family === family);
      if (font) loadFont(font);
    }
  }, [layout]);

  // Where each cell sits, as the same object every time the board is drawn: a new one each
  // time would make every cell (they are memo'd) draw again whenever the board does, hundreds of
  // them, even those whose character has not changed.
  const placeStyles = useRef(new Map<string, CSSProperties>());
  const placeStyle = (key: string, x: number, y: number): CSSProperties => {
    let placed = placeStyles.current.get(key);
    if (!placed) placeStyles.current.set(key, (placed = { gridColumn: x + 1, gridRow: y + 1 }));
    return placed;
  };

  const gapX = cell.gapX ?? Math.round(cell.width * 0.08);
  const gapY = cell.gapY ?? Math.round(cell.height * 0.12);
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${layout.columns}, ${cell.width}px)`,
    gridTemplateRows: `repeat(${layout.rows}, ${cell.height}px)`,
    columnGap: gapX,
    rowGap: gapY,
  };

  return (
    <div className={`board${showAreas ? " board-show-areas" : ""}`} style={gridStyle}>
      {[...cells].map(([key, ch]) => {
        const spec = specs.get(key);
        if (!spec) return null;
        const [x, y] = key.split(",").map(Number);
        const common = {
          char: ch,
          width: cell.width,
          height: cell.height,
          color: spec.color,
          style: placeStyle(key, x, y),
        };
        switch (spec.type) {
          case "dotmatrix":
            return <DotMatrixCell key={key} {...common} finish={spec.finish} />;
          case "segment":
            return <SegmentCell key={key} {...common} segments={spec.segments} finish={spec.finish} />;
          case "flipdot":
            return <FlipDotCell key={key} {...common} background={spec.background} sweepIndex={x} onFlip={onDotFlips} />;
          default:
            return (
              <SplitFlapCell
                key={key}
                {...common}
                fontFamily={spec.fontFamily}
                stack={spec.stack}
                flipMs={spec.flipMs}
                clock={clockFor(spec.flipMs)}
                background={spec.background}
                onFlap={onFlap}
              />
            );
        }
      })}
      {flaps.map((f) => {
        const across = f.rect.x2 - f.rect.x1 + 1;
        const down = f.rect.y2 - f.rect.y1 + 1;
        return (
          <WholeValueFlap
            key={f.key}
            value={f.value}
            faces={drums.get(f.drumKey) ?? [""]}
            width={across * cell.width + (across - 1) * gapX}
            height={down * cell.height + (down - 1) * gapY}
            cellWidth={cell.width}
            cellHeight={cell.height}
            fontFamily={f.spec.fontFamily}
            color={f.spec.color}
            background={f.spec.background}
            flipMs={f.spec.flipMs}
            clock={clockFor(f.spec.flipMs)}
            align={f.align}
            images={f.image}
            fit={f.fit}
            onFlap={onFlap}
            style={gridArea(f.rect)}
          />
        );
      })}
      {images.map((im) => (
        <div key={im.key} className="board-value-image" style={gridArea(im.rect)}>
          {im.src && <img src={im.src} alt="" style={{ objectFit: im.fit }} />}
        </div>
      ))}
      {texts.map((t) => (
        <TextArea key={t.key} block={t} />
      ))}
      {statics.map((s) => (
        <div
          key={s.id}
          className="board-static"
          style={{
            ...gridArea(s.rect),
            padding: s.padding,
            background: s.background,
            border: s.border ? `${s.borderWidth ?? 1}px solid ${s.border}` : undefined,
          }}
        >
          {s.image && <img className="board-static-image" src={s.image} alt="" style={{ objectFit: s.fit ?? "contain" }} />}
          {typeof s.text === "string" && s.text !== "" && <StaticText area={s} rect={s.rect} board={layout} />}
          {showAreas && <span className="board-area-label">{s.id}</span>}
        </div>
      ))}
      {showTiming && <TimingReadout />}
      {fields.map(({ id, rect }) => (
        <div key={id} className="board-field-outline" style={gridArea(rect)}>
          <span className="board-area-label">{id}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The board's beats: one clock for each flip time its split-flaps use (an area can have its own),
 * so all the flaps that fall at one speed fall together. Kept for as long as the board is up,
 * and stopped when it goes. Returns undefined for every flip time when flaps keep their own time.
 */
function useFlapClocks(
  together: boolean,
  onBeat: ((landed: number, dueAt: number, ofTotal: number) => void) | undefined,
  splitFlaps: number
): (flipMs?: number) => FlapClock | undefined {
  const clocks = useRef(new Map<number, FlapClock>());
  const onBeatRef = useRef(onBeat);
  onBeatRef.current = onBeat;
  const splitFlapsRef = useRef(splitFlaps);
  splitFlapsRef.current = splitFlaps;
  useEffect(() => {
    const all = clocks.current;
    // Stopped, but kept: a cell that mounts again (React's strict mode does this) joins the same one.
    return () => {
      for (const clock of all.values()) clock.stop();
    };
  }, []);
  return (flipMs = DEFAULT_FLIP_MS) => {
    if (!together) return undefined;
    let clock = clocks.current.get(flipMs);
    if (!clock) clocks.current.set(flipMs, (clock = new FlapClock(flipMs, (landed, dueAt) => onBeatRef.current?.(landed, dueAt, splitFlapsRef.current))));
    return clock;
  };
}

/** As SplitFlapCell's own default. */
const DEFAULT_FLIP_MS = 80;

/**
 * The faces on each whole-value drum, by drum. A drum only ever gains faces while the board is
 * up: a value that leaves the data keeps its face, so the drum never reshuffles, as a real one
 * cannot. Each drum's list stays the same object until it changes, so its flaps need not redraw.
 */
function useDrums(flaps: Flap[]): Map<string, string[]> {
  const seen = useRef(new Map<string, { values: Set<string>; given: string; faces: string[] }>());
  return useMemo(() => {
    const drums = new Map<string, string[]>();
    for (const f of flaps) {
      if (drums.has(f.drumKey)) continue;
      const given = JSON.stringify(f.drum);
      let drum = seen.current.get(f.drumKey);
      if (!drum) seen.current.set(f.drumKey, (drum = { values: new Set(), given, faces: [] }));
      const size = drum.values.size;
      f.values.forEach((v) => drum.values.add(v));
      if (drum.values.size !== size || drum.given !== given || drum.faces.length === 0) {
        drum.given = given;
        drum.faces = drumFaces(f.drum, drum.values, f.image);
      }
      drums.set(f.drumKey, drum.faces);
    }
    return drums;
  }, [flaps]);
}

/**
 * Plain text over an area of the grid. One row high it stays on one line and ends in "…" if too
 * long; taller, it wraps, and whatever does not fit is cut off at the bottom.
 */
function TextArea({ block }: { block: TextBlock }) {
  const { style } = block;
  return (
    <div
      className={`board-text${block.wrap ? " board-text-wrap" : ""}`}
      style={{
        ...gridArea(block.rect),
        color: style.color,
        background: style.background,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        letterSpacing: style.letterSpacing ? `${style.letterSpacing}px` : undefined,
        lineHeight: style.lineHeight,
        ...textStyleCss(style),
        textAlign: block.align,
        justifyContent: block.align === "right" ? "flex-end" : block.align === "center" ? "center" : "flex-start",
      }}
    >
      <span>{block.text}</span>
    </div>
  );
}

/** A static area's fixed text, filling the area, laid over any image. */
function StaticText({ area, rect, board }: { area: StaticArea; rect: Rect; board: BoardLayout }) {
  const style = resolveStaticText(board.cell, area);
  const align = area.align ?? "left";
  return (
    <div
      className={`board-static-text${rect.y2 > rect.y1 ? " board-text-wrap" : ""}`}
      style={{
        color: style.color,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        ...textStyleCss(style),
        textAlign: align,
        justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
      }}
    >
      <span>{area.text}</span>
    </div>
  );
}

/** Areas that can be drawn: ones that parse and fit on the board. validateLayout explains the rest. */
function placedAreas<A extends { area: string }>(layout: BoardLayout, areas: A[]) {
  return areas
    .map((a) => ({ ...a, rect: parseArea(a.area ?? "") }))
    .filter((a): a is A & { rect: Rect } => !!a.rect && a.rect.x2 < layout.columns && a.rect.y2 < layout.rows);
}

/** Bold, italic and underline as CSS; unset leaves the area's usual weight and style. */
function textStyleCss(style: TextSpec): CSSProperties {
  return {
    fontWeight: style.bold ? 700 : undefined,
    fontStyle: style.italic ? "italic" : undefined,
    textDecoration: style.underline ? "underline" : undefined,
  };
}

function gridArea(r: Rect): CSSProperties {
  return { gridColumn: `${r.x1 + 1} / ${r.x2 + 2}`, gridRow: `${r.y1 + 1} / ${r.y2 + 2}` };
}

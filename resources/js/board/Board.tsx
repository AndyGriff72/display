import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { BEAT_LATENCY } from "../audio/flapSound";
import { enableBeatTiming } from "../cells/splitflap/beatTiming";
import { DEFAULT_PRINT_MS, PrintedCell, printPlan } from "../cells/printing";
import { FlapClock, MotionTracker } from "../cells/splitflap/flapClock";
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
  turnGroups,
  wholeValueFlaps,
  withCards,
  type TextBlock,
  type TextSpec,
  type WholeValueFlap as Flap,
} from "./compose";
import { parseArea, type BoardLayout, type Rect, type StaticArea } from "./layout";
import { IMAGE_REFERRER } from "./images";
import { motionGovernor, RenderLag, settingFromAddress } from "./motion";
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
  /**
   * Called when the board has finished showing a page, a new layout, or new data: when its last
   * split-flap stops (at once, if nothing had to move). Paging counts from here (see usePaging).
   * Data that changes nothing on the board does not call it.
   */
  onSettled?: () => void;
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
export function Board({ layout: given, values: givenValues, records = [], page = 0, onBeat, onFlap, onSettled, onDotFlips, showAreas }: BoardProps) {
  // Card lists become ordinary fields, each filled from its card's record (see withCards).
  const expanded = useMemo(() => withCards(given, records, page), [given, records, page]);
  const layout = expanded.layout;
  const values = useMemo(() => (expanded.cards.length ? { ...givenValues, ...expanded.values } : givenValues), [givenValues, expanded]);
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
  // How much the board moves (see motion.ts): as set, or on "auto" as much as this device keeps up with.
  const motionSetting = settingFromAddress(cell.motion);
  const autoMotion = useSyncExternalStore(motionGovernor.subscribe, motionGovernor.getLevel);
  const motion = motionSetting === "auto" ? autoMotion : motionSetting;
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  // A change is over: the motion level is judged on it, then whoever is waiting is told.
  const settled = () => {
    motionGovernor.end();
    onSettledRef.current?.();
  };
  // Drums keeping their own time (no clock) say when they move, so the board still knows when a
  // change is over.
  const trackerRef = useRef<MotionTracker | null>(null);
  trackerRef.current ??= new MotionTracker(() => {
    if (!clocks.busy()) settledRef.current();
  });
  const tracker = trackerRef.current;
  const settledRef = useRef(settled);
  settledRef.current = settled;
  const clocks = useFlapClocks(layout.cell.flapTiming !== "independent", onBeat, splitFlaps, () => {
    if (!tracker.busy) settledRef.current();
  });
  const clockFor = clocks.clockFor;
  // How rows take their turn (see CellSettings): each a number of beats after the row above,
  // or each once the rows above have finished; and whether a changing row clears first.
  const together = layout.cell.flapTiming !== "independent";
  const rowsInTurn = together && layout.cell.rowsInTurn === true;
  const rowDelay = together && !rowsInTurn ? (layout.cell.rowDelay ?? 0) : 0;
  // What takes its turn (see CellSettings.turnBy), as a number for each position: rows in order,
  // pairs of rows, or cards (positions in no card going a row at a time). Lower goes first.
  const turnBy = rowsInTurn ? (layout.cell.turnBy ?? "row") : "row";
  const groupOf = useMemo(() => turnGroups(turnBy, expanded.cards), [turnBy, expanded.cards]);
  const rowKeys = useMemo(() => (layout.cell.clearRows ? groupContents(cells, flaps, groupOf) : null), [layout.cell.clearRows, cells, flaps, groupOf]);
  for (const flipMs of new Set([...specs.values(), ...flaps.map((f) => f.spec)].map((s) => s.flipMs))) {
    const clock = clockFor(flipMs);
    if (clock) clock.rowByRow = rowsInTurn;
  }
  // A new page or layout: settled at once if nothing moves, or else when the last flap stops.
  // Cells join their clocks in their own (earlier-running) effects, so by now the board knows.
  useEffect(() => {
    if (!clocks.busy() && !tracker.busy) settled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, given]);
  // Anything set moving by this drawing: watch how the device copes until it stops (see motion.ts).
  useEffect(() => {
    if (clocks.busy() || tracker.busy) motionGovernor.begin(motionSetting === "auto");
  });
  // Flip-dot clicks wait for the drawing as the beats' sound does (see RenderLag).
  const onDotFlipsRef = useRef(onDotFlips);
  onDotFlipsRef.current = onDotFlips;
  const dotFlips = useCallback((delays: number[]) => onDotFlipsRef.current?.(delays.map((d) => d + renderLag.extraMs)), []);
  const images = useMemo(() => imageAreas(layout, values, records, page), [layout, values, records, page]);

  // Lit cells printing their characters one at a time (see printing.tsx): each row's printing
  // cells left to right, which rows have just changed, and when each cell prints.
  const printing = layout.cell.printOut === true && motion === "full";
  const printMs = layout.cell.printMs ?? DEFAULT_PRINT_MS;
  const printedRows = useMemo(() => {
    if (!printing) return null;
    const rows = new Map<number, { key: string; char: string; x: number }[]>();
    for (const [key, ch] of cells) {
      const type = specs.get(key)?.type;
      if (type !== "dotmatrix" && type !== "segment") continue;
      const [x, y] = key.split(",").map(Number);
      let row = rows.get(y);
      if (!row) rows.set(y, (row = []));
      row.push({ key, char: ch, x });
    }
    for (const row of rows.values()) row.sort((a, b) => a.x - b.x);
    return rows;
  }, [printing, cells, specs]);
  const printKeys = useMemo(
    () => new Map([...(printedRows ?? new Map<number, { char: string }[]>())].map(([y, row]) => [y, row.map((c) => c.char).join("")])),
    [printedRows]
  );
  // The rows as last drawn, to tell which have just changed (updated once drawn, not while drawing).
  const printedBefore = useRef(new Map<number, string>());
  const printSteps = useMemo(() => {
    if (!printedRows) return null;
    const changed = new Set([...printKeys].filter(([y, k]) => printedBefore.current.get(y) !== k).map(([y]) => y));
    return printPlan(printedRows, printKeys, changed, printMs, layout.cell.printRows === "inTurn");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printedRows, printKeys, printMs, layout.cell.printRows]);
  useEffect(() => {
    printedBefore.current = printKeys;
  }, [printKeys]);
  const fields = useMemo(
    // Outlines: fields and lists as given, and each card of each card list.
    () =>
      showAreas
        ? [
            ...placedAreas(given, [...(given.fields ?? []), ...(given.lists ?? [])]),
            ...expanded.cards.map((rect, i) => ({ id: `card ${i + 1}`, rect })),
          ]
        : [],
    [given, expanded, showAreas]
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
            if (printSteps) return <PrintedCell key={key} kind="dotmatrix" {...common} finish={spec.finish} step={printSteps.get(key)} printMs={printMs} tracker={tracker} />;
            return <DotMatrixCell key={key} {...common} finish={spec.finish} fade={motion === "full"} />;
          case "segment":
            if (printSteps)
              return <PrintedCell key={key} kind="segment" {...common} segments={spec.segments} finish={spec.finish} step={printSteps.get(key)} printMs={printMs} tracker={tracker} />;
            return <SegmentCell key={key} {...common} segments={spec.segments} finish={spec.finish} />;
          case "flipdot":
            return <FlipDotCell key={key} {...common} background={spec.background} sweepIndex={x} onFlip={onDotFlips && dotFlips} tracker={tracker} sweep={motion === "full"} />;
          default:
            return (
              <SplitFlapCell
                key={key}
                {...common}
                fontFamily={spec.fontFamily}
                stack={spec.stack}
                flipMs={spec.flipMs}
                clock={clockFor(spec.flipMs)}
                tracker={together ? undefined : tracker}
                startDelay={rowDelay * y}
                row={groupOf(x, y)}
                rowKey={rowKeys?.get(groupOf(x, y))}
                background={spec.background}
                onFlap={onFlap}
                motion={motion}
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
            tracker={together ? undefined : tracker}
            startDelay={rowDelay * f.rect.y1}
            row={groupOf(f.rect.x1, f.rect.y1)}
            rowKey={rowKeys?.get(groupOf(f.rect.x1, f.rect.y1))}
            align={f.align}
            images={f.image}
            fit={f.fit}
            onFlap={onFlap}
            motion={motion}
            style={gridArea(f.rect)}
          />
        );
      })}
      {images.map((im) => (
        <div key={im.key} className="board-value-image" style={gridArea(im.rect)}>
          {im.src && <img src={im.src} alt="" referrerPolicy={IMAGE_REFERRER} style={{ objectFit: im.fit }} />}
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
          {s.image && <img className="board-static-image" src={s.image} alt="" referrerPolicy={IMAGE_REFERRER} style={{ objectFit: s.fit ?? "contain" }} />}
          {typeof s.text === "string" && s.text !== "" && <StaticText area={s} rect={s.rect} board={layout} />}
          {showAreas && <span className="board-area-label">{s.id}</span>}
        </div>
      ))}
      {showTiming && <TimingReadout motion={motion} setting={motionSetting} />}
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
 * and stopped when it goes. clockFor gives undefined for every flip time when flaps keep their
 * own time. `onAllIdle` is called when the last clock with anything moving stops.
 */
function useFlapClocks(
  together: boolean,
  onBeat: ((landed: number, dueAt: number, ofTotal: number) => void) | undefined,
  splitFlaps: number,
  onAllIdle: () => void
): { clockFor: (flipMs?: number) => FlapClock | undefined; busy: () => boolean } {
  const clocks = useRef(new Map<number, FlapClock>());
  const onBeatRef = useRef(onBeat);
  onBeatRef.current = onBeat;
  const splitFlapsRef = useRef(splitFlaps);
  splitFlapsRef.current = splitFlaps;
  const onAllIdleRef = useRef(onAllIdle);
  onAllIdleRef.current = onAllIdle;
  const busy = () => [...clocks.current.values()].some((c) => c.busy);
  useEffect(() => {
    const all = clocks.current;
    // Stopped, but kept: a cell that mounts again (React's strict mode does this) joins the same one.
    return () => {
      for (const clock of all.values()) clock.stop();
    };
  }, []);
  const clockFor = (flipMs = DEFAULT_FLIP_MS) => {
    if (!together) return undefined;
    let clock = clocks.current.get(flipMs);
    if (!clock) {
      clock = new FlapClock(
        flipMs,
        (landed, dueAt) => {
          // How the device is keeping up (see motion.ts), and the sound put where the picture is.
          renderLag.note(dueAt, (lag) => motionGovernor.shown(lag, flipMs));
          onBeatRef.current?.(landed, dueAt + renderLag.extraMs, splitFlapsRef.current);
        },
        () => {
          if (!busy()) onAllIdleRef.current();
        }
      );
      clocks.current.set(flipMs, clock);
    }
    return clock;
  };
  return { clockFor, busy };
}

/**
 * What each group (see turnGroups) shows, as one string per group: its characters, and the
 * values of any whole-value flaps starting in it. When a group's string changes, a board whose
 * rows clear before changing clears that group (see CellSettings.clearRows).
 */
function groupContents(cells: Map<string, string>, flaps: Flap[], groupOf: (x: number, y: number) => number): Map<number, string> {
  const groups = new Map<number, string[]>();
  const add = (group: number, part: string) => {
    let parts = groups.get(group);
    if (!parts) groups.set(group, (parts = []));
    parts.push(part);
  };
  for (const [key, ch] of cells) {
    const [x, y] = key.split(",").map(Number);
    add(groupOf(x, y), `${x},${y}:${ch}`);
  }
  for (const f of flaps) add(groupOf(f.rect.x1, f.rect.y1), `${f.key}=${f.value}`);
  return new Map([...groups].map(([group, parts]) => [group, parts.join("|")]));
}

/** As SplitFlapCell's own default. */
const DEFAULT_FLIP_MS = 80;

/** How far behind its beat the drawing reaches the screen, beyond what the sound allows for already. */
const renderLag = new RenderLag(BEAT_LATENCY * 1000);

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

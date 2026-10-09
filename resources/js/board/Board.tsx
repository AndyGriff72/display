import { useEffect, useMemo, type CSSProperties } from "react";
import { DotMatrixCell } from "../cells/dotmatrix/DotMatrixCell";
import { SegmentCell } from "../cells/segment/SegmentCell";
import { SplitFlapCell } from "../cells/splitflap/SplitFlapCell";
import { FONTS, loadFont } from "../fonts";
import type { Row } from "./binding";
import { cellSpecs, composeBoard, fontsUsed, resolveStaticText, textBlocks, type TextBlock } from "./compose";
import { parseArea, type BoardLayout, type Rect, type StaticArea } from "./layout";
import "./Board.css";

export interface BoardProps {
  layout: BoardLayout;
  /** Text for each field, by field id. */
  values: Record<string, string>;
  /** The data source's records, which lists show one per row. */
  records?: Row[];
  /** Which page of records lists show; see pageOffset. */
  page?: number;
  /** Called each time a flap lands anywhere on the board. */
  onFlap?: () => void;
  /** Outline the static areas and fields, with their ids, for checking a layout. */
  showAreas?: boolean;
}

/**
 * A grid of character cells, each drawn as its area's cell type, with static areas and text
 * areas laid over it. Everything is placed on the same CSS grid, so an area covers the gaps
 * between the cells it replaces and the board keeps its shape around it.
 */
export function Board({ layout, values, records = [], page = 0, onFlap, showAreas }: BoardProps) {
  const { cell } = layout;
  const specs = useMemo(() => cellSpecs(layout), [layout]);
  const cells = useMemo(() => composeBoard(layout, values, records, page), [layout, values, records, page]);
  const texts = useMemo(() => textBlocks(layout, values, records, page), [layout, values, records, page]);
  const statics = useMemo(() => placedAreas(layout, layout.statics ?? []), [layout]);
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

  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${layout.columns}, ${cell.width}px)`,
    gridTemplateRows: `repeat(${layout.rows}, ${cell.height}px)`,
    columnGap: cell.gapX ?? Math.round(cell.width * 0.08),
    rowGap: cell.gapY ?? Math.round(cell.height * 0.12),
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
          style: { gridColumn: x + 1, gridRow: y + 1 },
        };
        switch (spec.type) {
          case "dotmatrix":
            return <DotMatrixCell key={key} {...common} />;
          case "segment":
            return <SegmentCell key={key} {...common} segments={spec.segments} />;
          default:
            return (
              <SplitFlapCell
                key={key}
                {...common}
                fontFamily={spec.fontFamily}
                stack={spec.stack}
                flipMs={spec.flipMs}
                background={spec.background}
                onFlap={onFlap}
              />
            );
        }
      })}
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
      {fields.map(({ id, rect }) => (
        <div key={id} className="board-field-outline" style={gridArea(rect)}>
          <span className="board-area-label">{id}</span>
        </div>
      ))}
    </div>
  );
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

function gridArea(r: Rect): CSSProperties {
  return { gridColumn: `${r.x1 + 1} / ${r.x2 + 2}`, gridRow: `${r.y1 + 1} / ${r.y2 + 2}` };
}

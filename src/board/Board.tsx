import { useMemo, type CSSProperties } from "react";
import { SplitFlapCell } from "../cells/splitflap/SplitFlapCell";
import { composeBoard, parseArea, type BoardLayout, type Rect } from "./layout";
import "./Board.css";

export interface BoardProps {
  layout: BoardLayout;
  /** Text for each field, by field id. */
  values: Record<string, string>;
  /** Called each time a flap lands anywhere on the board. */
  onFlap?: () => void;
  /** Outline the static areas and fields, with their ids, for checking a layout. */
  showAreas?: boolean;
}

/**
 * A grid of character cells with static areas cut out of it. Each cell and each static
 * area is placed on the same CSS grid, so a static area covers the gaps between the cells
 * it replaces and the board keeps its shape around it.
 */
export function Board({ layout, values, onFlap, showAreas }: BoardProps) {
  const { cell } = layout;
  const cells = useMemo(() => composeBoard(layout, values), [layout, values]);
  const statics = useMemo(() => placedAreas(layout, layout.statics ?? []), [layout]);
  const fields = useMemo(() => (showAreas ? placedAreas(layout, layout.fields ?? []) : []), [layout, showAreas]);

  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${layout.columns}, ${cell.width}px)`,
    gridTemplateRows: `repeat(${layout.rows}, ${cell.height}px)`,
    columnGap: cell.gapX ?? Math.round(cell.width * 0.08),
    rowGap: cell.gapY ?? Math.round(cell.height * 0.12),
  };

  return (
    <div className={`board${showAreas ? " board-show-areas" : ""}`} style={gridStyle}>
      {[...cells].map(([key, ch]) => {
        const [x, y] = key.split(",").map(Number);
        return (
          <SplitFlapCell
            key={key}
            char={ch}
            width={cell.width}
            height={cell.height}
            fontFamily={cell.fontFamily}
            stack={cell.stack}
            flipMs={cell.flipMs}
            onFlap={onFlap}
            style={{ gridColumn: x + 1, gridRow: y + 1 }}
          />
        );
      })}
      {statics.map(({ id, rect, image, fit, padding, background }) => (
        <div key={id} className="board-static" style={{ ...gridArea(rect), padding, background }}>
          {image && <img className="board-static-image" src={image} alt="" style={{ objectFit: fit ?? "contain" }} />}
          {showAreas && <span className="board-area-label">{id}</span>}
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

/** Areas that can be drawn: ones that parse and fit on the board. validateLayout explains the rest. */
function placedAreas<A extends { area: string }>(layout: BoardLayout, areas: A[]) {
  return areas
    .map((a) => ({ ...a, rect: parseArea(a.area ?? "") }))
    .filter((a): a is A & { rect: Rect } => !!a.rect && a.rect.x2 < layout.columns && a.rect.y2 < layout.rows);
}

function gridArea(r: Rect): CSSProperties {
  return { gridColumn: `${r.x1 + 1} / ${r.x2 + 2}`, gridRow: `${r.y1 + 1} / ${r.y2 + 2}` };
}

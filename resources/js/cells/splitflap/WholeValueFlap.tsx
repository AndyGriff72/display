import { memo, useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { faceFor } from "../../board/compose";
import type { FlapClock } from "./flapClock";
import { flapShades } from "./SplitFlapCell";
import { useFlapMotion } from "./useFlapMotion";
import "./SplitFlapCell.css";

export interface WholeValueFlapProps {
  /** The value to show; the face that matches it (see faceFor) comes round. */
  value: string;
  /** The faces on the drum, in the order they come round, a blank first. */
  faces: string[];
  /** The flap's size in pixels: the whole area it covers. */
  width: number;
  height: number;
  /** One cell's size, which the lettering and corners are sized from so they match the board's. */
  cellWidth: number;
  cellHeight: number;
  fontFamily?: string;
  color?: string;
  /** The flaps' colour, instead of the usual near-black. */
  background?: string;
  flipMs?: number;
  align?: "left" | "right" | "center";
  /** Faces are images' sources (see imageSource), drawn to fit the flap, rather than words. */
  images?: boolean;
  /** How each image fills the flap. */
  fit?: "contain" | "cover" | "fill";
  /** The board's beat (see FlapClock). Without one, the flap keeps its own time. */
  clock?: FlapClock;
  /** Without a clock: called each time a flap lands. */
  onFlap?: () => void;
  /** With a clock: beats to wait before starting to move (rows starting in turn). */
  startDelay?: number;
  style?: CSSProperties;
}

const FALLBACK_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/**
 * One long split-flap with a whole value, or an image, printed on each face, like the status flaps on station
 * boards. It turns exactly as a character cell does: forward through every face in between,
 * one flap at a time, until the one asked for comes round.
 *
 * It tracks the face it shows by its words rather than its place on the drum, so faces added
 * to the drum while it runs (new values in the data) do not make it jump.
 */
export const WholeValueFlap = memo(function WholeValueFlap({
  value,
  faces,
  width,
  height,
  cellWidth,
  cellHeight,
  fontFamily = FALLBACK_FONT,
  color,
  background,
  flipMs = 80,
  align = "left",
  images = false,
  fit = "contain",
  clock,
  onFlap,
  startDelay = 0,
  style,
}: WholeValueFlapProps) {
  const target = faces[faceFor(value, faces, images)] ?? "";
  const nextOf = useCallback((face: string) => faces[(faceFor(face, faces, images) + 1) % faces.length] ?? "", [faces, images]);
  const motion = useFlapMotion("", target, nextOf, flipMs, clock, onFlap, startDelay);

  const padding = Math.round(cellWidth * 0.25);
  const sizes = useFittedSizes(images ? [] : faces, fontFamily, Math.round(cellHeight * 0.7), width - 2 * padding);
  const current = faces[faceFor(motion.shown, faces, images)] ?? "";
  const flipping = motion.flipping;
  const coming = flipping ? motion.next : current;
  const glyph = (face: string): CSSProperties =>
    images ? { padding: Math.round(cellHeight * 0.08) } : { fontSize: sizes.get(face), textAlign: align, padding: `0 ${padding}px` };
  const draw = (face: string) => (images ? face && <img src={face} alt="" style={{ objectFit: fit }} /> : face);

  const vars = {
    "--sf-w": `${width}px`,
    "--sf-h": `${height}px`,
    "--sf-radius": `${Math.round(cellWidth * 0.08)}px`,
    "--sf-flip": `${flipMs}ms`,
    "--sf-font": fontFamily,
    ...(color ? { "--sf-fg": color } : {}),
    ...(background ? flapShades(background) : {}),
    ...style,
  } as CSSProperties;

  return (
    <div className={`sf-cell sf-whole${images ? " sf-images" : ""}`} style={vars} aria-label={images ? (current ? "image" : "") : current}>
      <Half pos="top" face={draw(coming)} style={glyph(coming)} />
      <Half pos="bottom" face={draw(current)} style={glyph(current)} />
      {flipping && (
        <span key={current} className="sf-flaps">
          <Half pos="top" face={draw(current)} style={glyph(current)} flap />
          <Half pos="bottom" face={draw(coming)} style={glyph(coming)} flap />
        </span>
      )}
    </div>
  );
});

function Half({ pos, face, style, flap }: { pos: "top" | "bottom"; face: ReactNode; style: CSSProperties; flap?: boolean }) {
  return (
    <span className={`sf-half sf-${pos}${flap ? " sf-flap" : ""}`} aria-hidden>
      <span className="sf-glyph" style={style}>
        {face}
      </span>
    </span>
  );
}

/**
 * A size for each face's lettering: `base`, or smaller for a face too long to fit `room`
 * pixels across at that size, so every face fits on the flap whole. Measured again once web
 * fonts arrive, since a fallback face measures differently.
 */
function useFittedSizes(faces: string[], fontFamily: string, base: number, room: number): Map<string, number> {
  const [fontsLoaded, setFontsLoaded] = useState(0);
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    const again = () => setFontsLoaded((n) => n + 1);
    fonts.addEventListener("loadingdone", again);
    return () => fonts.removeEventListener("loadingdone", again);
  }, []);

  return useMemo(() => {
    const sizes = new Map<string, number>();
    const context = document.createElement("canvas").getContext("2d");
    for (const face of faces) {
      let size = base;
      if (context && face) {
        context.font = `500 ${base}px ${fontFamily}`;
        const measured = context.measureText(face).width;
        if (measured > room && measured > 0) size = Math.max(4, Math.floor((base * room) / measured));
      }
      sizes.set(face, size);
    }
    return sizes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faces, fontFamily, base, room, fontsLoaded]);
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getScreen, type ScreenBoard } from "../api/screens";
import { flapSound } from "../audio/flapSound";
import { bindFields } from "../board/binding";
import { Board } from "../board/Board";
import { usePaging } from "../board/usePaging";
import { useBoardData } from "../board/useBoardData";
import { FONTS, loadFont } from "../fonts";
import "./ScreenPage.css";

/** How often a screen checks whether its board has been edited, in seconds. */
const LAYOUT_CHECK_SECONDS = 60;

/** How long the "tap for sound" hint stays up, in seconds. */
const SOUND_HINT_SECONDS = 15;

/**
 * A saved board, alone on the page and scaled to fill the display: what a screen in a station
 * or a reception shows. Nothing to sign in to and nothing to click; it keeps its data and its
 * layout up to date by itself.
 */
export default function ScreenPage() {
  const { key = "" } = useParams();
  const [board, setBoard] = useState<ScreenBoard | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Fetch the board, then check back for edits. Only an edited board replaces the one showing,
  // so a check that finds nothing new changes nothing on screen.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const load = async () => {
      try {
        const latest = await getScreen(key);
        if (cancelled) return;
        setBoard((shown) => (shown && shown.updatedAt === latest.updatedAt ? shown : latest));
        setProblem(null);
      } catch (e) {
        if (cancelled) return;
        if ((e as { response?: { status?: number } }).response?.status === 404) {
          setBoard(null);
          setProblem("This board no longer exists.");
        } else {
          // Keep showing the board already up; only say something if there is none yet.
          setProblem((p) => p ?? "Connecting…");
        }
      }
      if (!cancelled) timer = window.setTimeout(load, LAYOUT_CHECK_SECONDS * 1000);
    };
    load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key]);

  const layout = board?.layout;
  const data = useBoardData(layout?.dataSource);
  const page = usePaging(layout?.pageSeconds, layout?.dataSource);
  const values = useMemo(
    () => (layout ? bindFields((layout.fields ?? []).filter((f) => typeof f.text === "string"), data.rows, layout.pageFields ? page : undefined) : {}),
    [layout, data.rows, page]
  );

  // The typeface the board was saved with.
  useEffect(() => {
    const font = FONTS.find((f) => f.family === layout?.cell.fontFamily);
    if (font) loadFont(font);
  }, [layout?.cell.fontFamily]);

  useWakeLock();
  const sound = useSound(layout?.sound);
  const { outerRef, innerRef, scale } = useFitToScreen(board);

  // Double-click for full screen. A screen set up properly runs the browser in kiosk mode instead.
  const toggleFullScreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  return (
    <div className="screen" ref={outerRef} onDoubleClick={toggleFullScreen}>
      {layout && (
        <div className="screen-board" ref={innerRef} style={{ transform: `scale(${scale})` }}>
          <Board layout={layout} values={values} records={data.rows} page={page} onFlap={sound.onFlap} />
        </div>
      )}
      {!layout && problem && <p className="screen-message">{problem}</p>}
      {sound.hint && <p className="screen-hint">Tap the screen to turn on the flap sound</p>}
    </div>
  );
}

/** Ask the browser not to let the display sleep, and ask again whenever the page comes back. */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // Not offered (an insecure address, or an older browser): the screen's own power
        // settings will have to keep it awake.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);
}

/**
 * The flap sound, when the board asks for it. Browsers only allow sound once someone has
 * tapped, clicked or pressed a key on the page, so it starts then, with a hint until it has.
 */
function useSound(setting: { enabled?: boolean; volume?: number } | undefined) {
  const wanted = !!setting?.enabled;
  const [on, setOn] = useState(false);
  const [hintTimedOut, setHintTimedOut] = useState(false);

  useEffect(() => {
    flapSound.setVolume(setting?.volume ?? 0.5);
  }, [setting?.volume]);

  useEffect(() => {
    if (!wanted) {
      flapSound.disable();
      setOn(false);
      return;
    }
    const start = () => {
      flapSound
        .enable()
        .then(() => setOn(true))
        .catch(() => {});
    };
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
    const timer = window.setTimeout(() => setHintTimedOut(true), SOUND_HINT_SECONDS * 1000);
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      window.clearTimeout(timer);
    };
  }, [wanted]);

  return {
    onFlap: wanted && on ? () => flapSound.play() : undefined,
    hint: wanted && !on && !hintTimedOut,
  };
}

/** Scale the board, keeping its shape, to the largest size that fits the window. */
function useFitToScreen(trigger: unknown) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    // offsetWidth and offsetHeight are the board's own size, before the scaling.
    const fit = () => {
      const w = inner.offsetWidth;
      const h = inner.offsetHeight;
      if (w > 0 && h > 0) setScale(Math.min(outer.clientWidth / w, outer.clientHeight / h));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [trigger]);

  return { outerRef, innerRef, scale };
}

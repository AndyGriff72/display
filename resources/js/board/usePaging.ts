import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PAGE_SECONDS } from "./layout";

/**
 * The page of records a board is on, moving on `pageSeconds` after the board has finished
 * showing the last one (DEFAULT_PAGE_SECONDS when not given; 0 or less keeps it on the first
 * page). Lists and fields work out for themselves which records that page means, and stay put
 * when everything fits.
 *
 * The time is counted from when the board stops moving, which it says by calling `settled`
 * (Board's onSettled), so a slow change (a big board, rows starting in turn) is always seen
 * whole before the next page comes. If new data moves the board again while a page is up, the
 * count starts again once it stops. Until the board first says so, nothing moves on.
 *
 * Starts again from the first page whenever `restartWhen` changes, e.g. on a new data source.
 */
export function usePaging(pageSeconds: number | undefined, restartWhen: unknown): { page: number; settled: () => void } {
  const seconds = typeof pageSeconds === "number" ? pageSeconds : DEFAULT_PAGE_SECONDS;
  const [page, setPage] = useState(0);
  const timer = useRef<number | null>(null);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    setPage(0);
    return clear;
  }, [seconds, restartWhen]);

  const settled = useCallback(() => {
    clear();
    if (!(seconds > 0)) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setPage((p) => p + 1);
    }, seconds * 1000);
  }, [seconds]);

  return { page, settled };
}

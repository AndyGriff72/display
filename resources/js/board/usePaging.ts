import { useEffect, useState } from "react";
import { DEFAULT_PAGE_SECONDS } from "./layout";

/**
 * The page of records a board is on, moving on every `pageSeconds` (DEFAULT_PAGE_SECONDS when
 * not given; 0 or less keeps it on the first page). Lists and fields work out for themselves
 * which records that page means, and stay put when everything fits.
 *
 * Starts again from the first page whenever `restartWhen` changes, e.g. on a new data source.
 */
export function usePaging(pageSeconds: number | undefined, restartWhen: unknown): number {
  const seconds = typeof pageSeconds === "number" ? pageSeconds : DEFAULT_PAGE_SECONDS;
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
    if (!(seconds > 0)) return;
    const timer = window.setInterval(() => setPage((p) => p + 1), seconds * 1000);
    return () => window.clearInterval(timer);
  }, [seconds, restartWhen]);

  return page;
}

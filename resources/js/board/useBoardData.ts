import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Row } from "./binding";

export interface BoardDataState {
  rows: Row[];
  columns: string[];
  /** When the server last read these rows from the database. */
  fetchedAt: string | null;
  /** The server could not reach the database and sent the last rows it had. */
  stale: boolean;
  /** The board's own server could not be reached; the rows shown are the last ones received. */
  error: string | null;
  refreshSeconds: number | null;
}

const EMPTY: BoardDataState = { rows: [], columns: [], fetchedAt: null, stale: false, error: null, refreshSeconds: null };

/** How soon to try again after a failed fetch, in seconds. */
const RETRY_SECONDS = 15;

/**
 * A data source's rows, fetched now and again every refreshSeconds (as the server says). A
 * failed fetch keeps the rows already on the board rather than blanking it.
 */
export function useBoardData(key: string | undefined): BoardDataState {
  const [state, setState] = useState<BoardDataState>(EMPTY);

  useEffect(() => {
    setState(EMPTY);
    if (!key) return;

    let cancelled = false;
    let timer: number | undefined;
    const controller = new AbortController();

    const fetchOnce = async () => {
      let next = RETRY_SECONDS;
      try {
        const { data } = await api.get(`/board-data/${encodeURIComponent(key)}`, { signal: controller.signal });
        if (cancelled) return;
        setState({
          rows: data.data,
          columns: data.columns,
          fetchedAt: data.fetchedAt,
          stale: data.stale,
          error: null,
          refreshSeconds: data.refreshSeconds,
        });
        next = Math.max(5, data.refreshSeconds ?? RETRY_SECONDS);
      } catch (e) {
        if (cancelled) return;
        const message = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
        setState((s) => ({ ...s, error: message ?? "The board's server could not be reached." }));
      }
      if (!cancelled) timer = window.setTimeout(fetchOnce, next * 1000);
    };

    fetchOnce();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [key]);

  return state;
}

import type { BoardLayout } from "../board/layout";
import { api, type ApiResponse } from "./client";

export interface ScreenBoard {
  name: string;
  layout: BoardLayout;
  /** Changes whenever the board is saved; a screen compares it to know it has been edited. */
  updatedAt: string | null;
}

export async function getScreen(key: string): Promise<ScreenBoard> {
  const { data } = await api.get<ApiResponse<ScreenBoard>>(`/screens/${encodeURIComponent(key)}`);
  return data.data;
}

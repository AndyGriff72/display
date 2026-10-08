import type { BoardLayout } from "../board/layout";
import { api, type ApiResponse } from "./client";

export interface BoardSummary {
  id: number;
  uuid: string;
  name: string;
  updatedAt: string | null;
}

export interface SavedBoard extends BoardSummary {
  layout: BoardLayout;
}

export async function listBoards(): Promise<BoardSummary[]> {
  const { data } = await api.get<ApiResponse<BoardSummary[]>>("/boards");
  return data.data;
}

export async function getBoard(id: number): Promise<SavedBoard> {
  const { data } = await api.get<ApiResponse<SavedBoard>>(`/boards/${id}`);
  return data.data;
}

/** Save as a new board, or over an existing one when an id is given. */
export async function saveBoard(name: string, layout: BoardLayout, id?: number): Promise<ApiResponse<SavedBoard>> {
  const { data } = id ? await api.put(`/boards/${id}`, { name, layout }) : await api.post("/boards", { name, layout });
  return data;
}

export async function deleteBoard(id: number): Promise<ApiResponse<null>> {
  const { data } = await api.delete(`/boards/${id}`);
  return data;
}

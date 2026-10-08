import { api, type ApiResponse } from "./client";

export interface Engine {
  value: string;
  label: string;
  port: number;
}

/** The saved connection as the server describes it. The password itself is never sent back. */
export interface SavedConnection {
  id: number;
  name: string | null;
  driver: string;
  host: string;
  port: number;
  database: string;
  schema: string | null;
  username: string;
  ssl: boolean;
  hasStoredPassword: boolean;
  verifiedAt: string | null;
}

export interface ConnectionDetails {
  name: string;
  driver: string;
  host: string;
  port: number;
  database: string;
  schema: string;
  username: string;
  /** Blank means "keep the stored password". */
  password: string;
  ssl: boolean;
}

export async function getConnection(): Promise<ApiResponse<SavedConnection | null> & { engines: Engine[] }> {
  const { data } = await api.get("/connection");
  return data;
}

export async function testConnection(details: ConnectionDetails): Promise<ApiResponse<null>> {
  const { data } = await api.post("/connection/test", details);
  return data;
}

export async function saveConnection(details: ConnectionDetails): Promise<ApiResponse<SavedConnection>> {
  const { data } = await api.put("/connection", details);
  return data;
}

export async function deleteConnection(): Promise<ApiResponse<null>> {
  const { data } = await api.delete("/connection");
  return data;
}

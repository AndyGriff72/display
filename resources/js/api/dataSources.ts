import { api, type ApiResponse } from "./client";

export interface TableInfo {
  name: string;
  type: "table" | "view";
}

export interface ColumnInfo {
  name: string;
  type: string;
}

export type Operator =
  | "equals"
  | "not_equals"
  | "less_than"
  | "at_most"
  | "greater_than"
  | "at_least"
  | "contains"
  | "starts_with"
  | "has_value"
  | "has_no_value";

/** What a filter compares with: a typed value, or the database's own clock. */
export type ValueKind = "value" | "now" | "today";

export interface Filter {
  column: string;
  operator: Operator;
  valueKind: ValueKind;
  value: string | null;
}

export interface Sort {
  column: string;
  direction: "asc" | "desc";
}

/** One table, tables joined in the join builder, or a SELECT written by hand. */
export type DataSourceKind = "table" | "join" | "sql";

/** A table joined on: rows where `from` (an earlier table's "table.column") equals this table's `to` column. */
export interface Join {
  table: string;
  /** "inner" keeps only rows that match; "left" keeps rows with no match too. */
  type: "inner" | "left";
  from: string;
  to: string;
}

/** A link the database knows between two tables. */
export interface ForeignKey {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export interface DataSourceDefinition {
  name: string;
  kind: DataSourceKind;
  /** The starting table (unused for written SQL). */
  table: string;
  joins: Join[];
  sql: string | null;
  columns: string[];
  filters: Filter[];
  sort: Sort[];
  limit: number;
  cacheSeconds: number;
}

export interface SavedDataSource extends DataSourceDefinition {
  id: number;
  uuid: string;
  /** Where screens fetch this data source's rows from. */
  dataUrl: string;
}

export type Row = Record<string, string | number | null>;

export async function listTables(): Promise<TableInfo[]> {
  const { data } = await api.get<ApiResponse<TableInfo[]>>("/schema/tables");
  return data.data;
}

export async function listColumns(table: string): Promise<ColumnInfo[]> {
  const { data } = await api.get<ApiResponse<ColumnInfo[]>>(`/schema/tables/${encodeURIComponent(table)}/columns`);
  return data.data;
}

export async function listForeignKeys(): Promise<ForeignKey[]> {
  const { data } = await api.get<ApiResponse<ForeignKey[]>>("/schema/foreign-keys");
  return data.data;
}

export async function listDataSources(): Promise<SavedDataSource[]> {
  const { data } = await api.get<ApiResponse<SavedDataSource[]>>("/data-sources");
  return data.data;
}

export async function previewDataSource(definition: DataSourceDefinition): Promise<{ columns: string[]; rows: Row[] }> {
  const { data } = await api.post<ApiResponse<Row[]> & { columns: string[] }>("/data-sources/preview", definition);
  return { columns: data.columns, rows: data.data };
}

export async function saveDataSource(definition: DataSourceDefinition, id?: number): Promise<ApiResponse<SavedDataSource>> {
  const { data } = id ? await api.put(`/data-sources/${id}`, definition) : await api.post("/data-sources", definition);
  return data;
}

export async function deleteDataSource(id: number): Promise<ApiResponse<null>> {
  const { data } = await api.delete(`/data-sources/${id}`);
  return data;
}

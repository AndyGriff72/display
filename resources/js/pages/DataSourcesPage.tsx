import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiError } from "../api/client";
import {
  deleteDataSource,
  listColumns,
  listDataSources,
  listTables,
  previewDataSource,
  saveDataSource,
  type ColumnInfo,
  type DataSourceDefinition,
  type Filter,
  type Operator,
  type Row,
  type SavedDataSource,
  type TableInfo,
} from "../api/dataSources";

const OPERATORS: { value: Operator; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "less_than", label: "is less than / before" },
  { value: "at_most", label: "is at most" },
  { value: "greater_than", label: "is greater than / after" },
  { value: "at_least", label: "is at least" },
  { value: "contains", label: "contains" },
  { value: "starts_with", label: "starts with" },
  { value: "has_value", label: "has a value" },
  { value: "has_no_value", label: "has no value" },
];

const NO_VALUE: Operator[] = ["has_value", "has_no_value"];
const TEXT_ONLY: Operator[] = ["contains", "starts_with"];

const BLANK: DataSourceDefinition = {
  name: "",
  table: "",
  columns: [],
  filters: [],
  sort: [],
  limit: 10,
  cacheSeconds: 30,
};

type Notice = { kind: "ok" | "error"; text: string; problems?: string[] } | null;

function definitionOf(s: SavedDataSource): DataSourceDefinition {
  const { name, table, columns, filters, sort, limit, cacheSeconds } = s;
  return { name, table, columns, filters, sort, limit, cacheSeconds };
}

/** Choose what a board shows: one table or view, which columns, filtered, sorted and limited. */
export default function DataSourcesPage() {
  const [tables, setTables] = useState<TableInfo[] | null>(null);
  const [sources, setSources] = useState<SavedDataSource[]>([]);
  const [selected, setSelected] = useState<SavedDataSource | null>(null);
  const [draft, setDraft] = useState<DataSourceDefinition>(BLANK);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [preview, setPreview] = useState<{ columns: string[]; rows: Row[] } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([listTables(), listDataSources()])
      .then(([t, s]) => {
        setTables(t);
        setSources(s);
      })
      .catch((e) => setLoadError(apiError(e).message));
  }, []);

  // Columns follow the chosen table.
  useEffect(() => {
    if (!draft.table) {
      setColumns([]);
      return;
    }
    listColumns(draft.table)
      .then(setColumns)
      .catch((e) => setNotice({ kind: "error", text: apiError(e).message }));
  }, [draft.table]);

  const set = <K extends keyof DataSourceDefinition>(key: K, value: DataSourceDefinition[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const open = (source: SavedDataSource | null) => {
    setSelected(source);
    setDraft(source ? definitionOf(source) : BLANK);
    setPreview(null);
    setNotice(null);
  };

  // A different table means different columns: start the column choices again.
  const changeTable = (table: string) => {
    setDraft((d) => ({ ...d, table, columns: [], filters: [], sort: [] }));
    setPreview(null);
  };

  // Ticked columns keep the table's own order.
  const toggleColumn = (name: string, on: boolean) => {
    const chosen = new Set(draft.columns);
    if (on) chosen.add(name);
    else chosen.delete(name);
    set("columns", columns.map((c) => c.name).filter((n) => chosen.has(n)));
  };

  const updateFilter = (i: number, patch: Partial<Filter>) =>
    set("filters", draft.filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const firstColumn = columns[0]?.name ?? "";

  const attempt = async (action: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      const err = apiError(e);
      const problems = (e as { response?: { data?: { problems?: string[] } } }).response?.data?.problems;
      setNotice({ kind: "error", text: err.message, problems: problems && problems.length > 1 ? problems : undefined });
    } finally {
      setBusy(false);
    }
  };

  const onPreview = () =>
    attempt(async () => {
      setPreview(await previewDataSource(draft));
    });

  const onSave = () =>
    attempt(async () => {
      const res = await saveDataSource(draft, selected?.id);
      setSources((list) => [...list.filter((s) => s.id !== res.data.id), res.data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelected(res.data);
      setNotice({ kind: "ok", text: res.message });
    });

  const onDelete = () => {
    if (!selected || !window.confirm(`Remove "${selected.name}"? Any screen using it will stop getting data.`)) return;
    attempt(async () => {
      const res = await deleteDataSource(selected.id);
      setSources((list) => list.filter((s) => s.id !== selected.id));
      open(null);
      setNotice({ kind: "ok", text: res.message });
    });
  };

  if (loadError) {
    return (
      <main className="page">
        <h1>Data sources</h1>
        <p className="notice error">{loadError}</p>
        <p>
          <Link to="/connection">Set up the database connection</Link>
        </p>
      </main>
    );
  }
  if (!tables) return <main className="page">Loading…</main>;

  return (
    <main className="page wide-page">
      <h1>Data sources</h1>
      <p className="lede">
        What a board shows: rows from one table or view in the connected database. Need data from several tables?
        Create a view in the database that joins them, and choose it here.
      </p>

      <div className="split">
        <aside className="source-list">
          <button className={selected === null ? "active" : ""} onClick={() => open(null)}>
            + New data source
          </button>
          {sources.map((s) => (
            <button key={s.id} className={selected?.id === s.id ? "active" : ""} onClick={() => open(s)}>
              {s.name}
              <span className="hint">{s.table}</span>
            </button>
          ))}
        </aside>

        <section className="form">
          <label className="wide">
            Name
            <input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Next departures" />
          </label>

          <label className="wide">
            Table or view
            <select value={draft.table} onChange={(e) => changeTable(e.target.value)}>
              <option value="">Choose…</option>
              {tables.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                  {t.type === "view" ? " (view)" : ""}
                </option>
              ))}
            </select>
          </label>

          {draft.table && (
            <>
              <fieldset className="wide">
                <legend>Columns</legend>
                <div className="column-picks">
                  {columns.map((c) => (
                    <label key={c.name} className="check">
                      <input
                        type="checkbox"
                        checked={draft.columns.includes(c.name)}
                        onChange={(e) => toggleColumn(c.name, e.target.checked)}
                      />
                      {c.name} <span className="hint">{c.type}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="wide">
                <legend>Only rows where</legend>
                {draft.filters.length === 0 && <p className="hint">Every row, for now.</p>}
                {draft.filters.map((f, i) => (
                  <div className="row-editor" key={i}>
                    <select value={f.column} onChange={(e) => updateFilter(i, { column: e.target.value })}>
                      {columns.map((c) => (
                        <option key={c.name}>{c.name}</option>
                      ))}
                    </select>
                    <select
                      value={f.operator}
                      onChange={(e) => {
                        const operator = e.target.value as Operator;
                        updateFilter(i, TEXT_ONLY.includes(operator) ? { operator, valueKind: "value" } : { operator });
                      }}
                    >
                      {OPERATORS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {!NO_VALUE.includes(f.operator) && (
                      <>
                        <select
                          value={f.valueKind}
                          onChange={(e) => updateFilter(i, { valueKind: e.target.value as Filter["valueKind"] })}
                        >
                          <option value="value">the value</option>
                          {!TEXT_ONLY.includes(f.operator) && <option value="now">now</option>}
                          {!TEXT_ONLY.includes(f.operator) && <option value="today">today</option>}
                        </select>
                        {f.valueKind === "value" && (
                          <input value={f.value ?? ""} onChange={(e) => updateFilter(i, { value: e.target.value })} />
                        )}
                      </>
                    )}
                    <button className="icon" title="Remove this filter" onClick={() => set("filters", draft.filters.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    set("filters", [...draft.filters, { column: firstColumn, operator: "equals", valueKind: "value", value: "" }])
                  }
                >
                  + Add a filter
                </button>
              </fieldset>

              <fieldset className="wide">
                <legend>Sorted by</legend>
                {draft.sort.length === 0 && <p className="hint">The database's own order.</p>}
                {draft.sort.map((s, i) => (
                  <div className="row-editor" key={i}>
                    <select
                      value={s.column}
                      onChange={(e) => set("sort", draft.sort.map((x, j) => (j === i ? { ...x, column: e.target.value } : x)))}
                    >
                      {columns.map((c) => (
                        <option key={c.name}>{c.name}</option>
                      ))}
                    </select>
                    <select
                      value={s.direction}
                      onChange={(e) =>
                        set("sort", draft.sort.map((x, j) => (j === i ? { ...x, direction: e.target.value as "asc" | "desc" } : x)))
                      }
                    >
                      <option value="asc">ascending (A–Z, earliest first)</option>
                      <option value="desc">descending (Z–A, latest first)</option>
                    </select>
                    <button className="icon" title="Remove" onClick={() => set("sort", draft.sort.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </div>
                ))}
                {draft.sort.length < 5 && (
                  <button onClick={() => set("sort", [...draft.sort, { column: firstColumn, direction: "asc" }])}>+ Add a sort</button>
                )}
              </fieldset>

              <label>
                <span>
                  Rows <span className="hint">up to 100</span>
                </span>
                <input type="number" min={1} max={100} value={draft.limit} onChange={(e) => set("limit", Number(e.target.value))} />
              </label>
              <label>
                <span>
                  Check for new data every <span className="hint">seconds</span>
                </span>
                <input
                  type="number"
                  min={5}
                  max={3600}
                  value={draft.cacheSeconds}
                  onChange={(e) => set("cacheSeconds", Number(e.target.value))}
                />
              </label>
            </>
          )}

          {notice && (
            <div className={`notice wide ${notice.kind}`}>
              {notice.text}
              {notice.problems && (
                <ul>
                  {notice.problems.slice(1).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="buttons wide">
            <button onClick={onPreview} disabled={busy || !draft.table}>
              Preview
            </button>
            <button className="primary" onClick={onSave} disabled={busy || !draft.table}>
              Save
            </button>
            {selected && (
              <button className="danger" onClick={onDelete} disabled={busy}>
                Remove
              </button>
            )}
          </div>

          {selected && (
            <p className="hint wide">
              Screens fetch this from <code>{selected.dataUrl}</code>
            </p>
          )}

          {preview && (
            <div className="wide preview">
              {preview.rows.length === 0 ? (
                <p className="hint">No rows match.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      {preview.columns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr key={i}>
                        {preview.columns.map((c) => (
                          <td key={c}>{row[c] === null ? <span className="hint">no value</span> : String(row[c])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

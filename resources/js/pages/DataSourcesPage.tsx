import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiError } from "../api/client";
import {
  deleteDataSource,
  listColumns,
  listDataSources,
  listForeignKeys,
  listTables,
  previewDataSource,
  saveDataSource,
  type ColumnInfo,
  type DataSourceDefinition,
  type DataSourceKind,
  type Filter,
  type ForeignKey,
  type Join,
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

const KINDS: { value: DataSourceKind; label: string; hint: string }[] = [
  { value: "table", label: "One table", hint: "Rows from a single table or view." },
  { value: "join", label: "Joined tables", hint: "Start from one table and bring in matching rows from others." },
  { value: "sql", label: "Your own SQL", hint: "A SELECT written in your database's own SQL." },
];

const BLANK: DataSourceDefinition = {
  name: "",
  kind: "table",
  table: "",
  joins: [],
  sql: null,
  columns: [],
  filters: [],
  sort: [],
  limit: 10,
  cacheSeconds: 30,
};

type Notice = { kind: "ok" | "error"; text: string; problems?: string[] } | null;

function definitionOf(s: SavedDataSource): DataSourceDefinition {
  const { name, kind, table, joins, sql, columns, filters, sort, limit, cacheSeconds } = s;
  return { name, kind: kind ?? "table", table, joins: joins ?? [], sql: sql ?? null, columns, filters, sort, limit, cacheSeconds };
}

function describe(s: SavedDataSource): string {
  if (s.kind === "sql") return "your own SQL";
  if (s.kind === "join") return [s.table, ...(s.joins ?? []).map((j) => j.table)].join(" + ");
  return s.table;
}

/** Choose what a board shows: rows from one table, from joined tables, or from your own SQL. */
export default function DataSourcesPage() {
  const [tables, setTables] = useState<TableInfo[] | null>(null);
  const [foreignKeys, setForeignKeys] = useState<ForeignKey[]>([]);
  const [sources, setSources] = useState<SavedDataSource[]>([]);
  const [selected, setSelected] = useState<SavedDataSource | null>(null);
  const [draft, setDraft] = useState<DataSourceDefinition>(BLANK);
  const [columnsOf, setColumnsOf] = useState<Record<string, ColumnInfo[]>>({});
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
    listForeignKeys()
      .then(setForeignKeys)
      .catch(() => setForeignKeys([]));
  }, []);

  const joined = draft.kind === "join";
  const queryTables = useMemo(
    () => (draft.table ? [draft.table, ...(joined ? draft.joins.map((j) => j.table).filter(Boolean) : [])] : []),
    [draft.table, draft.joins, joined]
  );

  // Columns for every table in the query, fetched once each.
  useEffect(() => {
    for (const table of queryTables) {
      if (columnsOf[table]) continue;
      listColumns(table)
        .then((cols) => setColumnsOf((c) => ({ ...c, [table]: cols })))
        .catch((e) => setNotice({ kind: "error", text: apiError(e).message }));
    }
  }, [queryTables, columnsOf]);

  // How columns are named in the definition: plain for one table, table.column when joined.
  const refs = useMemo(
    () => queryTables.flatMap((t) => (columnsOf[t] ?? []).map((c) => (joined ? `${t}.${c.name}` : c.name))),
    [queryTables, columnsOf, joined]
  );
  const firstRef = refs[0] ?? "";

  const set = <K extends keyof DataSourceDefinition>(key: K, value: DataSourceDefinition[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const open = (source: SavedDataSource | null) => {
    setSelected(source);
    setDraft(source ? definitionOf(source) : BLANK);
    setPreview(null);
    setNotice(null);
  };

  // Moving between one table and joined tables keeps the choices, renamed to suit; anything
  // else starts the choices again.
  const changeKind = (kind: DataSourceKind) => {
    setPreview(null);
    setDraft((d) => {
      if (d.kind === "table" && kind === "join") {
        const q = (c: string) => `${d.table}.${c}`;
        return { ...d, kind, columns: d.columns.map(q), filters: d.filters.map((f) => ({ ...f, column: q(f.column) })), sort: d.sort.map((s) => ({ ...s, column: q(s.column) })) };
      }
      if (d.kind === "join" && kind === "table" && d.joins.length === 0) {
        const plain = (c: string) => c.slice(c.lastIndexOf(".") + 1);
        return { ...d, kind, columns: d.columns.map(plain), filters: d.filters.map((f) => ({ ...f, column: plain(f.column) })), sort: d.sort.map((s) => ({ ...s, column: plain(s.column) })) };
      }
      return { ...d, kind, joins: [], columns: [], filters: [], sort: [], sql: kind === "sql" ? (d.sql ?? "") : d.sql };
    });
  };

  // A different starting table means different columns: start the choices again.
  const changeTable = (table: string) => {
    setDraft((d) => ({ ...d, table, joins: [], columns: [], filters: [], sort: [] }));
    setPreview(null);
  };

  // Ticked columns keep the order the tables list them in.
  const toggleColumn = (ref: string, on: boolean) => {
    const chosen = new Set(draft.columns);
    if (on) chosen.add(ref);
    else chosen.delete(ref);
    set("columns", refs.filter((r) => chosen.has(r)));
  };

  const updateFilter = (i: number, patch: Partial<Filter>) =>
    set("filters", draft.filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  // --- Joins ---

  const updateJoin = (i: number, patch: Partial<Join>) =>
    setDraft((d) => {
      const joins = d.joins.map((j, k) => (k === i ? { ...j, ...patch } : j));
      // Choices that named a table no longer in the query go.
      const inQuery = new Set([d.table, ...joins.map((j) => j.table)]);
      const keep = (ref: string) => inQuery.has(ref.slice(0, ref.lastIndexOf(".")));
      return { ...d, joins, columns: d.columns.filter(keep), filters: d.filters.filter((f) => keep(f.column)), sort: d.sort.filter((s) => keep(s.column)) };
    });

  const removeJoin = (i: number) => {
    const removed = draft.joins[i].table;
    setDraft((d) => {
      const joins = d.joins.filter((_, k) => k !== i).filter((j) => !j.from.startsWith(removed + "."));
      const inQuery = new Set([d.table, ...joins.map((j) => j.table)]);
      const keep = (ref: string) => inQuery.has(ref.slice(0, ref.lastIndexOf(".")));
      return { ...d, joins, columns: d.columns.filter(keep), filters: d.filters.filter((f) => keep(f.column)), sort: d.sort.filter((s) => keep(s.column)) };
    });
  };

  const addJoin = (join?: Join) => {
    const used = new Set(queryTables);
    const table = join?.table ?? tables?.find((t) => !used.has(t.name))?.name ?? "";
    set("joins", [...draft.joins, join ?? { table, type: "left", from: firstRef, to: "" }]);
  };

  // Joins the database's own foreign keys make obvious, onto tables not yet in the query.
  const suggestions = useMemo(() => {
    if (!joined || !draft.table) return [];
    const inQuery = new Set(queryTables);
    const out: { label: string; join: Join }[] = [];
    for (const k of foreignKeys) {
      if (inQuery.has(k.fromTable) && !inQuery.has(k.toTable)) {
        out.push({ label: `${k.toTable} (where ${k.fromTable}.${k.fromColumn} = ${k.toTable}.${k.toColumn})`, join: { table: k.toTable, type: "left", from: `${k.fromTable}.${k.fromColumn}`, to: k.toColumn } });
      } else if (inQuery.has(k.toTable) && !inQuery.has(k.fromTable)) {
        out.push({ label: `${k.fromTable} (where ${k.toTable}.${k.toColumn} = ${k.fromTable}.${k.fromColumn})`, join: { table: k.fromTable, type: "left", from: `${k.toTable}.${k.toColumn}`, to: k.fromColumn } });
      }
    }
    return out;
  }, [joined, draft.table, queryTables, foreignKeys]);

  // --- Saving ---

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

  const ready = draft.kind === "sql" ? !!draft.sql?.trim() : !!draft.table;
  const columnSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {!refs.includes(value) && <option value={value}>{value || "Choose…"}</option>}
      {refs.map((r) => (
        <option key={r}>{r}</option>
      ))}
    </select>
  );

  return (
    <main className="page wide-page">
      <h1>Data sources</h1>
      <p className="lede">What a board shows: rows from the connected database.</p>

      <div className="split">
        <aside className="source-list">
          <button className={selected === null ? "active" : ""} onClick={() => open(null)}>
            + New data source
          </button>
          {sources.map((s) => (
            <button key={s.id} className={selected?.id === s.id ? "active" : ""} onClick={() => open(s)}>
              {s.name}
              <span className="hint">{describe(s)}</span>
            </button>
          ))}
        </aside>

        <section className="form">
          <label className="wide">
            Name
            <input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Next departures" />
          </label>

          <div className="wide kind-choice" role="radiogroup" aria-label="Kind of data source">
            {KINDS.map((k) => (
              <label key={k.value} className={draft.kind === k.value ? "chosen" : ""}>
                <input type="radio" name="kind" checked={draft.kind === k.value} onChange={() => changeKind(k.value)} />
                <span>
                  {k.label}
                  <span className="hint">{k.hint}</span>
                </span>
              </label>
            ))}
          </div>

          {draft.kind === "sql" ? (
            <label className="wide">
              <span>
                SELECT <span className="hint">in your database's own SQL. Name columns with AS to use them in templates, e.g. {"{due}"}.</span>
              </span>
              <textarea
                className="code"
                rows={10}
                spellCheck={false}
                value={draft.sql ?? ""}
                onChange={(e) => set("sql", e.target.value)}
                placeholder={"SELECT d.departs_at AS due, s.name AS destination\nFROM departures d\nJOIN stations s ON s.id = d.station_id\nWHERE d.departs_at >= NOW()\nORDER BY d.departs_at"}
              />
              <span className="hint">
                It runs read-only and stops after 5 seconds; the row limit below always applies. Saving runs it once, so it must work first.
              </span>
            </label>
          ) : (
            <label className="wide">
              {joined ? "Start from" : "Table or view"}
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
          )}

          {joined && draft.table && (
            <fieldset className="wide">
              <legend>Joined tables</legend>
              {draft.joins.length === 0 && <p className="hint">None yet.</p>}
              {draft.joins.map((j, i) => {
                const earlier = [draft.table, ...draft.joins.slice(0, i).map((x) => x.table)];
                const fromRefs = earlier.flatMap((t) => (columnsOf[t] ?? []).map((c) => `${t}.${c.name}`));
                return (
                  <div className="row-editor" key={i}>
                    <select value={j.type} onChange={(e) => updateJoin(i, { type: e.target.value as Join["type"] })} aria-label="Rows without a match">
                      <option value="left">Keep rows with no match in</option>
                      <option value="inner">Only rows with a match in</option>
                    </select>
                    <select value={j.table} onChange={(e) => updateJoin(i, { table: e.target.value, to: "" })} aria-label="Table">
                      {tables
                        .filter((t) => t.name === j.table || !queryTables.includes(t.name))
                        .map((t) => (
                          <option key={t.name}>{t.name}</option>
                        ))}
                    </select>
                    <span className="hint">where</span>
                    <select value={j.from} onChange={(e) => updateJoin(i, { from: e.target.value })} aria-label="Column it matches">
                      {!fromRefs.includes(j.from) && <option value={j.from}>{j.from || "Choose…"}</option>}
                      {fromRefs.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                    <span className="hint">=</span>
                    <select value={j.to} onChange={(e) => updateJoin(i, { to: e.target.value })} aria-label="Column in the joined table">
                      <option value="">{j.table}.…</option>
                      {(columnsOf[j.table] ?? []).map((c) => (
                        <option key={c.name} value={c.name}>
                          {j.table}.{c.name}
                        </option>
                      ))}
                    </select>
                    <button className="icon" title="Remove this join" onClick={() => removeJoin(i)}>
                      ×
                    </button>
                  </div>
                );
              })}
              <div className="row-editor">
                <button onClick={() => addJoin()}>+ Join a table</button>
                {suggestions.map((s) => (
                  <button key={s.label} className="suggestion" onClick={() => addJoin(s.join)} title="A link the database knows about">
                    + {s.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {draft.kind !== "sql" && draft.table && (
            <>
              <fieldset className="wide">
                <legend>Columns</legend>
                {queryTables.map((t) => (
                  <div key={t} className="column-group">
                    {joined && <div className="hint">{t}</div>}
                    <div className="column-picks">
                      {(columnsOf[t] ?? []).map((c) => {
                        const ref = joined ? `${t}.${c.name}` : c.name;
                        return (
                          <label key={ref} className="check">
                            <input type="checkbox" checked={draft.columns.includes(ref)} onChange={(e) => toggleColumn(ref, e.target.checked)} />
                            {c.name} <span className="hint">{c.type}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </fieldset>

              <fieldset className="wide">
                <legend>Only rows where</legend>
                {draft.filters.length === 0 && <p className="hint">Every row, for now.</p>}
                {draft.filters.map((f, i) => (
                  <div className="row-editor" key={i}>
                    {columnSelect(f.column, (column) => updateFilter(i, { column }), "Column")}
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
                        <select value={f.valueKind} onChange={(e) => updateFilter(i, { valueKind: e.target.value as Filter["valueKind"] })}>
                          <option value="value">the value</option>
                          {!TEXT_ONLY.includes(f.operator) && <option value="now">now</option>}
                          {!TEXT_ONLY.includes(f.operator) && <option value="today">today</option>}
                        </select>
                        {f.valueKind === "value" && <input value={f.value ?? ""} onChange={(e) => updateFilter(i, { value: e.target.value })} />}
                      </>
                    )}
                    <button className="icon" title="Remove this filter" onClick={() => set("filters", draft.filters.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </div>
                ))}
                <button onClick={() => set("filters", [...draft.filters, { column: firstRef, operator: "equals", valueKind: "value", value: "" }])}>
                  + Add a filter
                </button>
              </fieldset>

              <fieldset className="wide">
                <legend>Sorted by</legend>
                {draft.sort.length === 0 && <p className="hint">The database's own order.</p>}
                {draft.sort.map((s, i) => (
                  <div className="row-editor" key={i}>
                    {columnSelect(s.column, (column) => set("sort", draft.sort.map((x, j) => (j === i ? { ...x, column } : x))), "Column")}
                    <select
                      value={s.direction}
                      onChange={(e) => set("sort", draft.sort.map((x, j) => (j === i ? { ...x, direction: e.target.value as "asc" | "desc" } : x)))}
                    >
                      <option value="asc">ascending (A–Z, earliest first)</option>
                      <option value="desc">descending (Z–A, latest first)</option>
                    </select>
                    <button className="icon" title="Remove" onClick={() => set("sort", draft.sort.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </div>
                ))}
                {draft.sort.length < 5 && <button onClick={() => set("sort", [...draft.sort, { column: firstRef, direction: "asc" }])}>+ Add a sort</button>}
              </fieldset>
            </>
          )}

          {ready && (
            <>
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
                <input type="number" min={5} max={3600} value={draft.cacheSeconds} onChange={(e) => set("cacheSeconds", Number(e.target.value))} />
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
            <button onClick={onPreview} disabled={busy || !ready}>
              Preview
            </button>
            <button className="primary" onClick={onSave} disabled={busy || !ready}>
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
              <p className="hint">
                In templates: {preview.columns.map((c) => (
                  <code key={c} className="chip">{`{${c}}`}</code>
                ))}
              </p>
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

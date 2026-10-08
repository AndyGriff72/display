import { useEffect, useState, type FormEvent } from "react";
import { apiError } from "../api/client";
import {
  deleteConnection,
  getConnection,
  saveConnection,
  testConnection,
  type ConnectionDetails,
  type Engine,
  type SavedConnection,
} from "../api/connection";

const EMPTY: ConnectionDetails = {
  name: "",
  driver: "mysql",
  host: "",
  port: 3306,
  database: "",
  schema: "",
  username: "",
  password: "",
  ssl: false,
};

type Notice = { kind: "ok" | "error"; text: string } | null;

function detailsFrom(saved: SavedConnection): ConnectionDetails {
  return {
    name: saved.name ?? "",
    driver: saved.driver,
    host: saved.host,
    port: saved.port,
    database: saved.database,
    schema: saved.schema ?? "",
    username: saved.username,
    password: "",
    ssl: saved.ssl,
  };
}

/** The database the board reads from. */
export default function ConnectionPage() {
  const [engines, setEngines] = useState<Engine[]>([]);
  const [saved, setSaved] = useState<SavedConnection | null>(null);
  const [details, setDetails] = useState<ConnectionDetails>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"test" | "save" | "delete" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    getConnection()
      .then((res) => {
        setEngines(res.engines);
        setSaved(res.data);
        if (res.data) setDetails(detailsFrom(res.data));
      })
      .catch((e) => setNotice({ kind: "error", text: apiError(e).message }))
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof ConnectionDetails>(key: K, value: ConnectionDetails[K]) =>
    setDetails((d) => ({ ...d, [key]: value }));

  // Switching engine moves the port to the new engine's default, unless it had been changed by hand.
  const changeEngine = (driver: string) => {
    const before = engines.find((e) => e.value === details.driver);
    const after = engines.find((e) => e.value === driver);
    setDetails((d) => ({ ...d, driver, port: after && d.port === before?.port ? after.port : d.port }));
  };

  // The stored password only stands in while the details still point at the same server and user.
  const storedPasswordApplies =
    !!saved?.hasStoredPassword &&
    saved.host === details.host &&
    saved.port === Number(details.port) &&
    saved.username === details.username;

  const run = async (kind: "test" | "save" | "delete", action: () => Promise<{ message: string }>) => {
    setBusy(kind);
    setNotice(null);
    setFieldErrors({});
    try {
      const res = await action();
      setNotice({ kind: "ok", text: res.message });
    } catch (e) {
      const err = apiError(e);
      setNotice({ kind: "error", text: err.message });
      setFieldErrors(err.fields);
    } finally {
      setBusy(null);
    }
  };

  const onTest = () => run("test", () => testConnection(details));

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    run("save", async () => {
      const res = await saveConnection(details);
      setSaved(res.data);
      setDetails(detailsFrom(res.data));
      return res;
    });
  };

  const onDelete = () => {
    if (!window.confirm("Remove this connection? The board will have no data source until another is saved.")) return;
    run("delete", async () => {
      const res = await deleteConnection();
      setSaved(null);
      setDetails(EMPTY);
      return res;
    });
  };

  if (loading) return <main className="page">Loading…</main>;

  const isPostgres = details.driver === "pgsql";
  const field = (key: keyof ConnectionDetails) => fieldErrors[key] && <span className="field-error">{fieldErrors[key]}</span>;

  return (
    <main className="page">
      <h1>Database connection</h1>
      <p className="lede">
        The database the board reads its data from. The details are checked before they are saved, and the
        password is stored encrypted and never shown again.
      </p>

      <form className="form" onSubmit={onSave}>
        <label className="wide">
          <span>
            Name <span className="hint">optional</span>
          </span>
          <input value={details.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Timetable database" />
          {field("name")}
        </label>
        <label>
          Database type
          <select value={details.driver} onChange={(e) => changeEngine(e.target.value)}>
            {engines.map((en) => (
              <option key={en.value} value={en.value}>
                {en.label}
              </option>
            ))}
          </select>
          {field("driver")}
        </label>
        <label>
          Host
          <input value={details.host} onChange={(e) => set("host", e.target.value)} placeholder="e.g. 127.0.0.1" required />
          {field("host")}
        </label>
        <label>
          Port
          <input
            type="number"
            min={1}
            max={65535}
            value={details.port}
            onChange={(e) => set("port", Number(e.target.value))}
            required
          />
          {field("port")}
        </label>
        <label>
          Database
          <input value={details.database} onChange={(e) => set("database", e.target.value)} required />
          {field("database")}
        </label>
        {isPostgres && (
          <label>
            <span>
              Schema <span className="hint">blank for public</span>
            </span>
            <input value={details.schema} onChange={(e) => set("schema", e.target.value)} placeholder="public" />
            {field("schema")}
          </label>
        )}
        <label>
          Username
          <input value={details.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" required />
          {field("username")}
        </label>
        <label>
          Password
          <input
            type="password"
            value={details.password}
            onChange={(e) => set("password", e.target.value)}
            autoComplete="new-password"
            placeholder={storedPasswordApplies ? "Stored — leave blank to keep it" : ""}
          />
          {field("password")}
        </label>
        <label className="check wide">
          <input type="checkbox" checked={details.ssl} onChange={(e) => set("ssl", e.target.checked)} />
          Require SSL/TLS
        </label>
        <p className="hint wide">
          Use a database user that can only read. The board never writes, and a read-only user makes sure it cannot.
        </p>

        {notice && <p className={`notice wide ${notice.kind}`}>{notice.text}</p>}

        <div className="buttons wide">
          <button type="button" onClick={onTest} disabled={busy !== null}>
            {busy === "test" ? "Testing…" : "Test connection"}
          </button>
          <button type="submit" className="primary" disabled={busy !== null}>
            {busy === "save" ? "Checking and saving…" : "Save"}
          </button>
          {saved && (
            <button type="button" className="danger" onClick={onDelete} disabled={busy !== null}>
              Remove
            </button>
          )}
        </div>
        {saved?.verifiedAt && (
          <p className="hint wide">Last connected successfully {new Date(saved.verifiedAt).toLocaleString()}.</p>
        )}
      </form>
    </main>
  );
}

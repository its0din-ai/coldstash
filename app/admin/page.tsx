"use client";
import { useState, useEffect } from "react";
import AppShell from "@/components/layout/AppShell";
import Modal from "@/components/ui/Modal";
import { api } from "@/lib/client-fetch";
import type { UserRecord, SearchLogEntry, AuditEntry } from "@/types";

type AdminTab = "users" | "audit" | "searches";

const EVENT_STYLE: Record<string, string> = {
  login_success:    "text-green bg-green/10 border-green/25",
  login_failed:     "text-danger bg-danger/10 border-danger/25",
  rate_limited:     "text-danger bg-danger/10 border-danger/25",
  index_imported:   "text-blue bg-blue/10 border-blue/25",
  index_deleted:    "text-photo bg-photo/10 border-photo/25",
  user_created:     "text-accent bg-accent/10 border-accent/25",
  user_deleted:     "text-danger bg-danger/10 border-danger/25",
  password_changed: "text-blue bg-blue/10 border-blue/25",
  access_denied:    "text-danger bg-danger/10 border-danger/25",
  logout:           "text-muted bg-surface2 border-border",
};

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>("users");

  return (
    <AppShell>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Sub-tabs */}
        <div className="bg-surface border-b border-border px-6 pt-4 shrink-0">
          <div className="flex gap-1">
            {(["users", "audit", "searches"] as AdminTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`tab-btn ${tab === t ? "tab-btn-active" : ""}`}
              >
                {{ users: "👤 Users", audit: "🔐 Audit Log", searches: "📊 Search History" }[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {tab === "users"    && <UsersTab />}
          {tab === "audit"    && <AuditTab />}
          {tab === "searches" && <SearchesTab />}
        </div>
      </div>
    </AppShell>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users,   setUsers]   = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try { setUsers(await api.get<UserRecord[]>("/api/admin/users")); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function deleteUser(id: number, username: string) {
    if (!confirm(`Delete user "${username}"?`)) return;
    await api.delete(`/api/admin/users/${id}`);
    await load();
  }

  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">User Management</h2>
          <p className="text-xs text-muted mt-0.5">Manage who can access ColdStash</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-xs px-3 py-1.5">+ Add User</button>
      </div>

      {loading ? (
        <p className="text-muted text-sm text-center py-8">Loading…</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="card px-5 py-3 flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-surface2 border border-border flex items-center justify-center text-sm shrink-0">👤</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-ink">{u.username}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] border ${
                    u.role === "admin" ? "border-accent/30 text-accent bg-accent/10" : "border-border text-muted"}`}>
                    {u.role}
                  </span>
                  {!u.active && <span className="px-1.5 py-0.5 rounded text-[9px] border border-danger/30 text-danger">inactive</span>}
                </div>
                <div className="text-[10px] text-muted mt-0.5">
                  Last login: {u.last_login ?? "never"} · Created: {u.created_at.slice(0, 10)}
                </div>
              </div>
              <button onClick={() => deleteUser(u.id, u.username)} className="btn-danger shrink-0">Delete</button>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateUserModal onClose={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role,     setRole]     = useState<"viewer" | "admin">("viewer");
  const [error,    setError]    = useState("");
  const [saving,   setSaving]   = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.post("/api/admin/users", { username, password, role });
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Create User" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs text-muted mb-1.5">Username</label>
          <input className="input-base" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Password (min 8 chars)</label>
          <input className="input-base" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Role</label>
          <select className="input-base" value={role} onChange={(e) => setRole(e.target.value as "viewer" | "admin")}>
            <option value="viewer">viewer — search only</option>
            <option value="admin">admin — full access</option>
          </select>
        </div>
        {error && <p className="text-danger text-xs">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? "Creating…" : "Create"}</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Audit Log Tab ─────────────────────────────────────────────────────────────

function AuditTab() {
  const [entries,     setEntries]     = useState<AuditEntry[]>([]);
  const [filtered,    setFiltered]    = useState<AuditEntry[]>([]);
  const [textFilter,  setTextFilter]  = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [count,       setCount]       = useState("100");
  const [loading,     setLoading]     = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<AuditEntry[]>(`/api/admin/logs?n=${count}`);
      setEntries(data);
      setFiltered(data);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [count]);

  useEffect(() => {
    const tf = textFilter.toLowerCase();
    const ef = eventFilter;
    setFiltered(entries.filter((r) => {
      if (ef && r.event !== ef) return false;
      if (tf && !JSON.stringify(r).toLowerCase().includes(tf)) return false;
      return true;
    }));
  }, [textFilter, eventFilter, entries]);

  const eventTypes = [
    "login_success","login_failed","rate_limited","index_imported","index_deleted",
    "user_created","user_deleted","password_changed","access_denied","logout",
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="bg-surface border-b border-border px-6 py-3 flex items-center gap-3 shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs pointer-events-none">⌕</span>
          <input
            type="text"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            placeholder="Filter by event, user, IP…"
            className="input-base pl-8 py-1.5 text-xs"
          />
        </div>
        <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}
          className="input-base w-auto py-1.5 text-xs">
          <option value="">All events</option>
          {eventTypes.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={count} onChange={(e) => setCount(e.target.value)}
          className="input-base w-auto py-1.5 text-xs">
          <option value="100">Last 100</option>
          <option value="250">Last 250</option>
          <option value="500">Last 500</option>
        </select>
        <button onClick={load} className="btn-ghost py-1.5">↻ Refresh</button>
        <span className="text-xs text-muted ml-auto">{filtered.length} entries</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="text-center py-16 text-muted text-sm">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center py-16 text-muted text-xs">No log entries found.</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border text-muted text-[10px] tracking-widest uppercase">
                <th className="text-left px-4 py-3 whitespace-nowrap w-40">Timestamp</th>
                <th className="text-left px-4 py-3 w-40">Event</th>
                <th className="text-left px-4 py-3 w-28">User</th>
                <th className="text-left px-4 py-3 w-28">IP</th>
                <th className="text-left px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r, i) => {
                const style = EVENT_STYLE[r.event] ?? "text-muted bg-surface2 border-border";
                const details = Object.entries(r)
                  .filter(([k]) => !["ts", "event", "ip", "user"].includes(k))
                  .map(([k, v]) => `${k}: ${v}`)
                  .join("  ·  ");
                return (
                  <tr key={i} className="hover:bg-surface2/40 transition-colors">
                    <td className="px-4 py-2.5 text-muted whitespace-nowrap font-mono text-[10px]">
                      {r.ts.replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded border text-[9px] font-semibold ${style}`}>{r.event}</span>
                    </td>
                    <td className="px-4 py-2.5 text-ink">{r.user}</td>
                    <td className="px-4 py-2.5 text-muted font-mono text-[10px]">{r.ip}</td>
                    <td className="px-4 py-2.5 text-muted font-mono text-[10px] max-w-xs truncate" title={details}>{details}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Search History Tab ────────────────────────────────────────────────────────

function SearchesTab() {
  const [entries, setEntries]   = useState<SearchLogEntry[]>([]);
  const [filter,  setFilter]    = useState("");
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    api.get<SearchLogEntry[]>("/api/admin/search-stats")
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter
    ? entries.filter((r) =>
        r.username.toLowerCase().includes(filter.toLowerCase()) ||
        r.query.toLowerCase().includes(filter.toLowerCase()))
    : entries;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="bg-surface border-b border-border px-6 py-3 flex items-center gap-3 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs pointer-events-none">⌕</span>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by user or query…"
            className="input-base pl-8 py-1.5 text-xs"
          />
        </div>
        <span className="text-xs text-muted ml-auto">{filtered.length} entries</span>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="text-center py-16 text-muted text-sm">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center py-16 text-muted text-xs">No search history yet.</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border text-muted text-[10px] tracking-widest uppercase">
                <th className="text-left px-4 py-3 w-36">Time</th>
                <th className="text-left px-4 py-3 w-28">User</th>
                <th className="text-left px-4 py-3">Query</th>
                <th className="text-left px-4 py-3 w-24">Type</th>
                <th className="text-right px-4 py-3 w-20">Results</th>
                <th className="text-right px-4 py-3 w-16">ms</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-surface2/40 transition-colors">
                  <td className="px-4 py-2.5 text-muted font-mono text-[10px] whitespace-nowrap">{r.ts.slice(0, 16)}</td>
                  <td className="px-4 py-2.5 text-ink">{r.username}</td>
                  <td className="px-4 py-2.5 text-blue font-mono">{r.query || <span className="text-muted italic">empty</span>}</td>
                  <td className="px-4 py-2.5 text-muted">{r.file_type}</td>
                  <td className="px-4 py-2.5 text-right text-ink">{r.result_count.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-muted">{r.duration_ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

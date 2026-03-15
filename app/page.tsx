"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import AppShell from "@/components/layout/AppShell";
import Modal from "@/components/ui/Modal";
import { api } from "@/lib/client-fetch";
import {
  TYPE_ICON, TYPE_COLORS, ARCHIVE_BADGE,
  formatSize, formatCount, highlight,
} from "@/lib/file-utils";
import type { SearchResult, FileRecord, DiskRecord, GlobalStats } from "@/types";

// ── Constants ──────────────────────────────────────────────────────────────────

const FILE_TYPES = [
  { key: "all",      label: "All"      },
  { key: "document", label: "Docs"     },
  { key: "photo",    label: "Photos"   },
  { key: "video",    label: "Videos"   },
  { key: "audio",    label: "Audio"    },
  { key: "archive",  label: "Archives" },
  { key: "code",     label: "Code"     },
  { key: "other",    label: "Other"    },
] as const;
type TypeKey = (typeof FILE_TYPES)[number]["key"];

const TYPE_ACTIVE: Record<TypeKey, string> = {
  all:      "border-accent/60 text-accent",
  document: "border-[#a8d8ea]/60 text-[#a8d8ea]",
  photo:    "border-[#ffb347]/60 text-[#ffb347]",
  video:    "border-[#c39bd3]/60 text-[#c39bd3]",
  audio:    "border-[#7ec8a4]/60 text-[#7ec8a4]",
  archive:  "border-[#f4a460]/60 text-[#f4a460]",
  code:     "border-[#79c9f0]/60 text-[#79c9f0]",
  other:    "border-muted/60 text-muted",
};

// ── Search page ────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [query,        setQuery]        = useState("");
  const [activeType,   setActiveType]   = useState<TypeKey>("all");
  const [activeDisk,   setActiveDisk]   = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(true);
  const [page,         setPage]         = useState(1);
  const [result,       setResult]       = useState<SearchResult | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [disks,        setDisks]        = useState<DiskRecord[]>([]);
  const [stats,        setStats]        = useState<GlobalStats | null>(null);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);   // mobile filter drawer
  const [detail,       setDetail]       = useState<FileRecord | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const inputRef    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<DiskRecord[]>("/api/disks").then(setDisks).catch(() => {});
    api.get<GlobalStats>("/api/stats").then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault(); inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  const doSearch = useCallback(async (
    q: string, type: TypeKey, diskId: number | null,
    archived: boolean, pg: number,
  ) => {
    if (!q && type === "all" && diskId === null) { setResult(null); return; }
    setLoading(true);
    try {
      const p = new URLSearchParams({
        q, type, archived: archived ? "1" : "0",
        page: String(pg), per_page: "50",
      });
      if (diskId !== null) p.set("disk_id", String(diskId));
      setResult(await api.get<SearchResult>(`/api/search?${p}`));
    } catch { /* api client handles 401 */ }
    finally { setLoading(false); }
  }, []);

  function schedule(q: string, type: TypeKey, disk: number|null, arch: boolean, pg: number) {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(q, type, disk, arch, pg), 160);
  }

  function onQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value; setQuery(q); setPage(1);
    schedule(q, activeType, activeDisk, showArchived, 1);
  }
  function selectType(t: TypeKey) {
    setActiveType(t); setPage(1);
    schedule(query, t, activeDisk, showArchived, 1);
    setSidebarOpen(false);
  }
  function selectDisk(id: number|null) {
    setActiveDisk(id); setPage(1);
    schedule(query, activeType, id, showArchived, 1);
    setSidebarOpen(false);
  }
  function toggleArch(v: boolean) {
    setShowArchived(v); setPage(1);
    schedule(query, activeType, activeDisk, v, 1);
  }
  function goPage(pg: number) {
    setPage(pg);
    doSearch(query, activeType, activeDisk, showArchived, pg);
    document.getElementById("results-scroll")?.scrollTo(0, 0);
  }

  const groups = result
    ? result.results.reduce<Record<string, FileRecord[]>>((acc, f) => {
        (acc[f.disk_label] ??= []).push(f); return acc;
      }, {})
    : {};

  // ── Sidebar content (shared between desktop aside + mobile drawer) ──────────
  const sidebarContent = (
    <div className="flex flex-col gap-0">
      {/* Type filters */}
      <div className="px-3 pt-4 pb-3 border-b border-border">
        <p className="section-label mb-3">Filter by Type</p>
        <div className="flex flex-wrap gap-1.5">
          {FILE_TYPES.map(t => (
            <button key={t.key} onClick={() => selectType(t.key)}
              className={`px-2.5 py-1.5 rounded text-[11px] border transition-all font-mono
                ${activeType === t.key
                  ? `${TYPE_ACTIVE[t.key]} bg-surface2`
                  : "border-border text-muted hover:border-muted/60"}`}>
              {TYPE_ICON[t.key]} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Archive toggle */}
      <div className="px-3 py-3 border-b border-border">
        <label className="flex items-center gap-2.5 cursor-pointer group">
          <input type="checkbox" checked={showArchived} onChange={e => toggleArch(e.target.checked)}
            className="accent-[#f4a460] w-4 h-4" />
          <span className="text-xs text-muted group-hover:text-[#f4a460] transition-colors">
            📦 Include inside archives
          </span>
        </label>
      </div>

      {/* Stats */}
      <div className="px-3 py-3 border-b border-border">
        <p className="section-label mb-2.5">Statistics</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: "Disks",       val: stats ? String(stats.disks) : "—" },
            { label: "Files",       val: stats ? formatCount(stats.total_files) : "—" },
            { label: "Results",     val: result ? (result.total >= 500 ? "500+" : String(result.total)) : "—" },
            { label: "In Archives", val: stats ? formatCount(stats.archived_files) : "—" },
          ].map(s => (
            <div key={s.label} className="bg-surface2 border border-border rounded-lg p-2">
              <div className="font-display text-base font-bold text-accent">{s.val}</div>
              <div className="text-[9px] text-muted uppercase tracking-widest mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Disk filter */}
      <div className="px-3 pt-3 pb-1 shrink-0">
        <p className="section-label mb-2">Disk Filter</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
        {[
          { id: null as number|null, label: "All Disks", sub: `${disks.length} disks` },
          ...disks.map(d => ({ id: d.id as number|null, label: d.label, sub: formatCount(d.total_files) + " files" })),
        ].map(d => (
          <button key={d.id ?? "all"} onClick={() => selectDisk(d.id)}
            className={`w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-lg border
              transition-all text-xs
              ${activeDisk === d.id
                ? "border-accent/40 bg-accent/5 text-accent"
                : "border-transparent text-muted hover:border-border hover:bg-surface2"}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeDisk === d.id ? "bg-accent" : "bg-muted/40"}`} />
            <div className="min-w-0">
              <div className={`font-medium truncate ${activeDisk === d.id ? "text-accent" : "text-ink"}`}>{d.label}</div>
              <div className="text-[10px] text-muted">{d.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <AppShell>
      <div className="flex h-full overflow-hidden">

        {/* ── Desktop sidebar ── */}
        <aside className="hidden sm:flex w-60 bg-surface border-r border-border flex-col shrink-0 overflow-y-auto">
          {sidebarContent}
        </aside>

        {/* ── Mobile filter drawer overlay ── */}
        {sidebarOpen && (
          <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
            {/* Sheet */}
            <div className="relative bg-surface rounded-t-2xl max-h-[80vh] overflow-y-auto border-t border-border animate-fade-up">
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                <span className="font-display text-sm font-bold text-ink">Filters</span>
                <button onClick={() => setSidebarOpen(false)} className="text-muted hover:text-ink text-lg">✕</button>
              </div>
              {sidebarContent}
            </div>
          </div>
        )}

        {/* ── Main ── */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">

          {/* Search bar */}
          <div className="bg-surface border-b border-border px-3 sm:px-6 py-3 shrink-0">
            <div className="flex gap-2">
              {/* Mobile filter button */}
              <button onClick={() => setSidebarOpen(true)}
                className="sm:hidden flex items-center justify-center w-10 h-10 rounded-lg
                           bg-surface2 border border-border text-muted shrink-0 active:bg-surface">
                ⚙️
              </button>
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none select-none">⌕</span>
                <input
                  ref={inputRef}
                  type="search"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={query}
                  onChange={onQueryChange}
                  placeholder="Search… try *.mp4 or vacation"
                  className="w-full bg-surface2 border border-border rounded-lg pl-9 pr-4 py-2.5
                             text-sm text-ink focus:outline-none focus:border-blue transition-colors
                             placeholder:text-muted"
                />
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted px-0.5">
              <span><span className="text-blue">*.mp4</span> ext</span>
              <span><span className="text-blue">name</span> path</span>
              <span className="hidden sm:inline text-border">Ctrl+K</span>
              {result && <span className="ml-auto">{result.duration_ms}ms · {result.total.toLocaleString()} results</span>}
            </div>
          </div>

          {/* Results */}
          <div id="results-scroll" className="flex-1 overflow-y-auto px-3 sm:px-6 py-3">
            {loading && (
              <div className="flex items-center justify-center h-32 text-muted text-sm gap-2">
                <span className="animate-spin inline-block">⟳</span> Searching…
              </div>
            )}
            {!loading && !result && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted py-16">
                <div className="text-5xl">🗄️</div>
                <h3 className="font-display text-lg font-semibold text-ink">Start searching</h3>
                <p className="text-xs text-center leading-relaxed max-w-xs text-muted">
                  Type something above, or tap <strong className="text-ink">⚙️</strong> to filter by type or disk.
                </p>
              </div>
            )}
            {!loading && result && result.total === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
                <div className="text-5xl">😕</div>
                <h3 className="font-display text-lg font-semibold text-ink">No results</h3>
                <p className="text-xs text-center text-muted max-w-xs">
                  Nothing matched <strong className="text-ink">&quot;{query}&quot;</strong>.
                </p>
              </div>
            )}
            {!loading && result && result.total > 0 && (
              <div className="animate-slide-in space-y-4">
                {Object.entries(groups).map(([label, files]) => {
                  const archCount = files.filter(f => f.inside_archive).length;
                  return (
                    <div key={label}>
                      <div className="flex items-center gap-2 pb-1.5 mb-1.5 border-b border-border text-[10px] flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-accent/10 border border-accent/20
                                         text-accent text-[9px] font-semibold tracking-wide">{label}</span>
                        <span className="text-muted truncate max-w-[120px] sm:max-w-none">{files[0]?.disk_path ?? ""}</span>
                        {archCount > 0 && (
                          <span className="text-[#f4a460] text-[9px]">📦 {archCount} in archives</span>
                        )}
                        <span className="ml-auto text-muted">{files.length} shown</span>
                      </div>
                      {files.map(f => (
                        <FileRow key={f.id} file={f} query={query} onClick={() => setDetail(f)} />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          {result && result.pages > 1 && (
            <div className="bg-surface border-t border-border px-3 sm:px-6 py-2.5
                            flex items-center gap-1.5 shrink-0 flex-wrap">
              <span className="text-[10px] text-muted mr-1 hidden sm:inline">
                {((page-1)*50+1).toLocaleString()}–{Math.min(page*50, result.total).toLocaleString()} of {result.total.toLocaleString()}
              </span>
              <button onClick={() => goPage(page-1)} disabled={page<=1} className="pg-btn">←</button>
              {getPaginationNums(page, result.pages).map((n, i) =>
                n === "…"
                  ? <span key={`e${i}`} className="text-muted text-xs px-1">…</span>
                  : <button key={n} onClick={() => goPage(n as number)}
                      className={`pg-btn ${n === page ? "border-accent text-accent" : ""}`}>{n}</button>
              )}
              <button onClick={() => goPage(page+1)} disabled={page>=result.pages} className="pg-btn">→</button>
              <span className="ml-auto text-[10px] text-muted sm:hidden">
                {page}/{result.pages}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── File detail modal ── */}
      {detail && <FileDetailModal file={detail} query={query} onClose={() => setDetail(null)} />}
    </AppShell>
  );
}

// ── File row ──────────────────────────────────────────────────────────────────

function FileRow({
  file: f, query, onClick,
}: { file: FileRecord; query: string; onClick: () => void }) {
  const icon   = TYPE_ICON[f.type]   ?? "📎";
  const colors = TYPE_COLORS[f.type] ?? TYPE_COLORS.other;
  const isArch = f.inside_archive;
  const parts  = isArch ? f.path.split("::") : [];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border
        border-transparent hover:bg-surface2 hover:border-border active:bg-surface2
        transition-all mb-0.5 group
        ${isArch ? "border-l-2 !border-l-[rgba(244,164,96,0.4)] bg-[rgba(244,164,96,0.03)]" : ""}`}
    >
      {/* Type icon */}
      <div className="w-9 h-9 rounded-md flex items-center justify-center text-sm shrink-0 border"
        style={{ background: colors.bg, borderColor: colors.border }}>
        {icon}
      </div>

      {/* Name + path */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink truncate group-hover:text-accent transition-colors">
          {highlight(f.name, query)}
        </div>
        {isArch ? (
          <>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="px-1.5 py-0.5 bg-[rgba(244,164,96,0.1)] border border-[rgba(244,164,96,0.25)]
                               rounded text-[#f4a460] text-[9px] shrink-0">
                📦 {ARCHIVE_BADGE[f.archive_type ?? ""] ?? (f.archive_type ?? "").toUpperCase()}
              </span>
              <span className="text-muted text-[10px] truncate">
                {highlight(parts[0] ?? "", query)}
              </span>
            </div>
            <div className="flex items-center gap-1 mt-0.5 ml-1">
              <span className="text-muted text-[10px] shrink-0">↳</span>
              <span className="text-muted text-[10px] truncate">
                {highlight(parts[1] ?? f.path, query)}
              </span>
            </div>
          </>
        ) : (
          <div className="text-muted text-[10px] mt-0.5 truncate">
            📁 {highlight(f.path, query)}
          </div>
        )}
      </div>

      {/* Meta — size + date */}
      <div className="text-right shrink-0 text-[11px] text-muted space-y-0.5 ml-2">
        <div>{formatSize(f.size)}</div>
        <div className="hidden sm:block">{f.modified?.slice(0,10) ?? ""}</div>
      </div>

      {/* Chevron hint */}
      <span className="text-muted/40 text-xs shrink-0 group-hover:text-muted transition-colors">›</span>
    </button>
  );
}

// ── File detail modal ─────────────────────────────────────────────────────────

function FileDetailModal({
  file: f, query, onClose,
}: { file: FileRecord; query: string; onClose: () => void }) {
  const icon   = TYPE_ICON[f.type]   ?? "📎";
  const colors = TYPE_COLORS[f.type] ?? TYPE_COLORS.other;
  const isArch = f.inside_archive;
  const parts  = isArch ? f.path.split("::") : [];

  function CopyBtn({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);
    return (
      <button
        onClick={() => {
          navigator.clipboard.writeText(value).then(() => {
            setCopied(true); setTimeout(() => setCopied(false), 1500);
          }).catch(() => {});
        }}
        className="text-[10px] px-2 py-0.5 rounded border border-border text-muted
                   hover:border-blue hover:text-blue transition-colors shrink-0"
      >
        {copied ? "✓" : "Copy"}
      </button>
    );
  }

  function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
      <div className="py-2.5 border-b border-border last:border-0">
        <div className="text-[10px] text-muted uppercase tracking-widest mb-1">{label}</div>
        <div className="flex items-start gap-2">
          <span className={`text-sm text-ink break-all flex-1 ${mono ? "font-mono text-xs" : ""}`}>
            {value}
          </span>
          <CopyBtn value={value} />
        </div>
      </div>
    );
  }

  return (
    <Modal title="File Details" onClose={onClose} wide>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-border">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0 border"
          style={{ background: colors.bg, borderColor: colors.border }}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-ink text-base leading-tight break-all">
            {highlight(f.name, query)}
          </div>
          <div className="text-xs text-muted mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="px-1.5 py-0.5 rounded bg-surface2 border border-border capitalize">
              {f.type}
            </span>
            {f.ext && (
              <span className="font-mono text-blue">{f.ext}</span>
            )}
            {isArch && (
              <span className="px-1.5 py-0.5 bg-[rgba(244,164,96,0.1)] border border-[rgba(244,164,96,0.25)]
                               rounded text-[#f4a460] text-[10px]">
                📦 Inside archive
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Detail rows */}
      <div className="space-y-0">
        <Row label="Disk"     value={f.disk_label} />
        {f.disk_path && <Row label="Drive"    value={f.disk_path} mono />}

        {isArch ? (
          <>
            <Row label="Archive path" value={parts[0] ?? f.path} mono />
            <Row label="Path inside archive" value={parts[1] ?? ""} mono />
          </>
        ) : (
          <Row label="Full path" value={f.path} mono />
        )}

        <Row label="File size"     value={`${formatSize(f.size)} (${f.size.toLocaleString()} bytes)`} />
        {f.modified && <Row label="Modified" value={f.modified} />}

        {/* Where to find it */}
        <div className="py-2.5">
          <div className="text-[10px] text-muted uppercase tracking-widest mb-2">
            How to find it
          </div>
          <div className="bg-surface2 border border-border rounded-lg px-3 py-2.5 font-mono text-xs text-muted leading-relaxed break-all">
            {isArch ? (
              <>
                Connect disk <strong className="text-ink">{f.disk_label}</strong>
                {f.disk_path && <> ({f.disk_path})</>}
                <br />
                Open archive: <strong className="text-ink">{parts[0]}</strong>
                <br />
                Extract: <strong className="text-ink">{parts[1] ?? f.name}</strong>
              </>
            ) : (
              <>
                Connect disk <strong className="text-ink">{f.disk_label}</strong>
                {f.disk_path && <> ({f.disk_path})</>}
                <br />
                Navigate to: <strong className="text-blue">{f.path}</strong>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Pagination helper ─────────────────────────────────────────────────────────

function getPaginationNums(current: number, total: number): (number | "…")[] {
  const s = new Set([1, total, current-1, current, current+1].filter(n => n>=1 && n<=total));
  const sorted = [...s].sort((a, b) => a - b);
  const out: (number | "…")[] = []; let prev = 0;
  for (const n of sorted) { if (n - prev > 1) out.push("…"); out.push(n); prev = n; }
  return out;
}
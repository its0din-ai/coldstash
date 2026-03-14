"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import AppShell from "@/components/layout/AppShell";
import { api } from "@/lib/client-fetch";
import { TYPE_ICON, TYPE_COLORS, ARCHIVE_BADGE, formatSize, formatCount, highlight } from "@/lib/file-utils";
import type { SearchResult, FileRecord, DiskRecord, GlobalStats } from "@/types";

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
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const inputRef    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<DiskRecord[]>("/api/disks").then(setDisks).catch(() => {});
    api.get<GlobalStats>("/api/stats").then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); inputRef.current?.focus(); }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  const doSearch = useCallback(async (q: string, type: TypeKey, diskId: number | null, archived: boolean, pg: number) => {
    if (!q && type === "all" && diskId === null) { setResult(null); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, type, archived: archived ? "1" : "0", page: String(pg), per_page: "50" });
      if (diskId !== null) params.set("disk_id", String(diskId));
      setResult(await api.get<SearchResult>(`/api/search?${params}`));
    } catch { /* api client handles 401 redirect */ }
    finally { setLoading(false); }
  }, []);

  function schedule(q: string, type: TypeKey, disk: number | null, archived: boolean, pg: number) {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(q, type, disk, archived, pg), 160);
  }

  function onQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value; setQuery(q); setPage(1);
    schedule(q, activeType, activeDisk, showArchived, 1);
  }
  function selectType(t: TypeKey)      { setActiveType(t);  setPage(1); schedule(query, t,          activeDisk, showArchived, 1); }
  function selectDisk(id: number|null) { setActiveDisk(id); setPage(1); schedule(query, activeType, id,         showArchived, 1); }
  function toggleArch(v: boolean)      { setShowArchived(v);setPage(1); schedule(query, activeType, activeDisk, v,            1); }
  function goPage(pg: number)          { setPage(pg); doSearch(query, activeType, activeDisk, showArchived, pg); }

  const groups = result
    ? result.results.reduce<Record<string, FileRecord[]>>((acc, f) => { (acc[f.disk_label] ??= []).push(f); return acc; }, {})
    : {};

  return (
    <AppShell>
      <div className="flex h-full overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="w-60 bg-surface border-r border-border flex flex-col shrink-0 overflow-hidden">
          {/* Type filters */}
          <div className="px-3 pt-4 pb-3 border-b border-border">
            <p className="section-label mb-3">Filter by Type</p>
            <div className="flex flex-wrap gap-1.5">
              {FILE_TYPES.map(t => (
                <button key={t.key} onClick={() => selectType(t.key)}
                  className={`px-2 py-1 rounded text-[10px] border transition-all font-mono
                    ${activeType === t.key ? `${TYPE_ACTIVE[t.key]} bg-surface2` : "border-border text-muted hover:border-muted/60"}`}>
                  {TYPE_ICON[t.key]} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Archive toggle */}
          <div className="px-3 py-3 border-b border-border">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={showArchived} onChange={e => toggleArch(e.target.checked)}
                className="accent-accent w-3.5 h-3.5" />
              <span className="text-[11px] text-muted group-hover:text-accent transition-colors">
                📦 Include inside archives
              </span>
            </label>
          </div>

          {/* Stats grid */}
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
          <div className="px-3 pt-3 pb-1 shrink-0"><p className="section-label mb-2">Disk Filter</p></div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
            {[{ id: null as number|null, label: "All Disks", sub: `${disks.length} disks` },
              ...disks.map(d => ({ id: d.id as number|null, label: d.label, sub: formatCount(d.total_files) + " files" }))
            ].map(d => (
              <button key={d.id ?? "all"} onClick={() => selectDisk(d.id)}
                className={`w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all text-xs
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
        </aside>

        {/* ── Main ── */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Search bar */}
          <div className="bg-surface border-b border-border px-6 py-4 shrink-0">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted text-base pointer-events-none select-none">⌕</span>
              <input ref={inputRef} type="text" autoComplete="off" spellCheck={false}
                value={query} onChange={onQueryChange}
                placeholder="Search files… try  *.7z  or  CVE-2020"
                className="w-full bg-surface2 border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-ink
                           focus:outline-none focus:border-blue transition-colors placeholder:text-muted" />
            </div>
            <div className="mt-2 flex items-center gap-4 text-[10px] text-muted">
              <span><span className="text-blue">*.7z</span> — ext</span>
              <span><span className="text-blue">CVE-2020</span> — name/path</span>
              <span className="text-border hidden sm:inline">Ctrl+K</span>
              {result && <span className="ml-auto">{result.duration_ms}ms</span>}
            </div>
          </div>

          {/* Results area */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading && (
              <div className="flex items-center justify-center h-32 text-muted text-sm gap-2">
                <span className="inline-block animate-spin">⟳</span> Searching…
              </div>
            )}
            {!loading && !result && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted">
                <div className="text-5xl">🗄️</div>
                <h3 className="font-display text-lg font-semibold text-ink">Start searching</h3>
                <p className="text-xs text-center leading-relaxed max-w-xs">Type something above, or pick a type or disk from the sidebar.</p>
              </div>
            )}
            {!loading && result && result.total === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted">
                <div className="text-5xl">😕</div>
                <h3 className="font-display text-lg font-semibold text-ink">No results</h3>
                <p className="text-xs text-center max-w-xs leading-relaxed">
                  Nothing matched <strong className="text-ink">&quot;{query}&quot;</strong>.
                </p>
              </div>
            )}
            {!loading && result && result.total > 0 && (
              <div className="animate-slide-in space-y-5">
                {Object.entries(groups).map(([label, files]) => {
                  const archCount = files.filter(f => f.inside_archive).length;
                  return (
                    <div key={label}>
                      <div className="flex items-center gap-2 pb-1.5 mb-2 border-b border-border text-[10px]">
                        <span className="px-2 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent text-[9px] font-semibold tracking-wide">{label}</span>
                        <span className="text-muted">{files[0]?.disk_path ?? ""}</span>
                        {archCount > 0 && <span className="text-[#f4a460] text-[9px]">📦 {archCount} in archives</span>}
                        <span className="ml-auto text-muted">{files.length} shown</span>
                      </div>
                      {files.map(f => <FileRow key={f.id} file={f} query={query} />)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          {result && result.pages > 1 && (
            <div className="bg-surface border-t border-border px-6 py-3 flex items-center gap-1.5 shrink-0 flex-wrap">
              <span className="text-[10px] text-muted mr-2">
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
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function FileRow({ file: f, query }: { file: FileRecord; query: string }) {
  const icon   = TYPE_ICON[f.type]   ?? "📎";
  const colors = TYPE_COLORS[f.type] ?? TYPE_COLORS.other;
  const isArch = f.inside_archive;
  const parts  = isArch ? f.path.split("::") : [];
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border border-transparent
      hover:bg-surface2 hover:border-border transition-all cursor-default mb-0.5
      ${isArch ? "border-l-2 !border-l-[rgba(244,164,96,0.4)] bg-[rgba(244,164,96,0.03)]" : ""}`}>
      <div className="w-8 h-8 rounded-md flex items-center justify-center text-sm shrink-0 border"
        style={{ background: colors.bg, borderColor: colors.border }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink truncate">{highlight(f.name, query)}</div>
        {isArch ? (
          <>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="px-1.5 py-0.5 bg-[rgba(244,164,96,0.1)] border border-[rgba(244,164,96,0.25)] rounded text-[#f4a460] text-[9px] shrink-0">
                📦 {ARCHIVE_BADGE[f.archive_type ?? ""] ?? (f.archive_type ?? "").toUpperCase()}
              </span>
              <span className="text-muted text-[10px] truncate">📁 {highlight(parts[0] ?? "", query)}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5 ml-1">
              <span className="text-muted text-[10px] shrink-0">↳</span>
              <span className="text-muted text-[10px] truncate">{highlight(parts[1] ?? f.path, query)}</span>
            </div>
          </>
        ) : (
          <div className="text-muted text-[10px] mt-0.5 truncate">📁 {highlight(f.path, query)}</div>
        )}
      </div>
      <div className="text-right shrink-0 text-[11px] text-muted space-y-0.5">
        <div>{formatSize(f.size)}</div>
        <div>{f.modified?.slice(0,10) ?? ""}</div>
      </div>
    </div>
  );
}

function getPaginationNums(current: number, total: number): (number | "…")[] {
  const s = new Set([1, total, current-1, current, current+1].filter(n => n>=1 && n<=total));
  const sorted = [...s].sort((a,b)=>a-b);
  const out: (number|"…")[] = []; let prev = 0;
  for (const n of sorted) { if (n-prev>1) out.push("…"); out.push(n); prev=n; }
  return out;
}

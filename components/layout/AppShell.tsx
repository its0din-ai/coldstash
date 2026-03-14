"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getStoredUser, clearToken, api } from "@/lib/client-fetch";
import ChangePasswordModal from "@/components/ui/ChangePasswordModal";

const NAV = [
  { href: "/", label: "🔍 Search" },
  { href: "/disks", label: "💾 Disks" },
  { href: "/guide", label: "📖 Guide" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ username: string; role: string } | null>(null);
  const [showCPW, setShowCPW] = useState(false);
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';
  const isDev = process.env.NODE_ENV === 'development';

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) { router.replace("/login"); return; }
    setUser(stored);
  }, [router]);

  async function handleLogout() {
    await api.post("/api/auth/logout", {}).catch(() => { });
    clearToken();
    router.push("/login");
  }

  if (!user) return null;

  const nav = user.role === "admin"
    ? [...NAV, { href: "/admin", label: "⚙️ Admin" }]
    : NAV;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="bg-surface border-b border-border flex items-center gap-4 px-5 py-3 shrink-0">
        <div className="font-display text-xl font-extrabold tracking-tight">
          <a href="/">
          <span className="text-accent">Cold</span>
          <span className="text-ink">Stash</span>
          </a>
        </div>
        <div className="w-px h-5 bg-border mx-1" />

        <nav className="flex gap-1">
          {nav.map((n) => {
            const active = pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href));
            return (
              <button
                key={n.href}
                onClick={() => router.push(n.href)}
                className={`nav-btn ${active ? "nav-btn-active" : "nav-btn-inactive"}`}
              >
                {n.label}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted hidden sm:block">Signed in as:</span>
          <span className="text-xs text-muted hover:text-green/80 transition-colors px-2 py-1 rounded hover:bg-green/10">{user.username}</span>
          💀
          <button
            onClick={() => setShowCPW(true)}
            className="text-xs text-muted hover:text-accent/80 transition-colors px-2 py-1 rounded hover:bg-accent/10"
            title="Change password"
          >chpasswd</button>
          <button
            onClick={handleLogout}
            className="text-xs text-danger hover:text-danger/80 transition-colors px-2 py-1 rounded hover:bg-danger/10"
          >Sign out</button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-hidden">{children}</main>

      {/* Status bar */}
      <div className="bg-surface border-t border-border px-5 py-1 shrink-0">
        <span className="text-[10px] text-muted">
          ColdStash v{appVersion}{isDev ? '-(dev)' : ''} | Vibecoded with Claude Sonnet 4.6 | Security assessed by <a className="text-red-800 hover:text-red-600" href="https://www.encrypt0r.net/">encrypt0r</a>
        </span>
      </div>

      {showCPW && <ChangePasswordModal onClose={() => setShowCPW(false)} />}
    </div>
  );
}

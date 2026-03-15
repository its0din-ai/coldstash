"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getStoredUser, clearToken, api } from "@/lib/client-fetch";
import ChangePasswordModal from "@/components/ui/ChangePasswordModal";

const NAV = [
  { href: "/",      label: "Search", icon: "🔍" },
  { href: "/disks", label: "Disks",  icon: "💾" },
  { href: "/guide", label: "Guide",  icon: "📖" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [user,    setUser]    = useState<{ username: string; role: string } | null>(null);
  const [showCPW, setShowCPW] = useState(false);

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) { router.replace("/login"); return; }
    setUser(stored);
  }, [router]);

  async function handleLogout() {
    await api.post("/api/auth/logout", {}).catch(() => {});
    clearToken();
    router.push("/login");
  }

  if (!user) return null;

  const nav = user.role === "admin"
    ? [...NAV, { href: "/admin", label: "Admin", icon: "⚙️" }]
    : NAV;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Top header ── */}
      <header className="bg-surface border-b border-border flex items-center gap-2 px-4 py-2.5 shrink-0">
        {/* Logo */}
        <div className="font-display text-lg font-extrabold tracking-tight shrink-0">
          <span className="text-accent">Cold</span>
          <span className="text-ink">Stash</span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden sm:flex gap-1 ml-3">
          {nav.map((n) => {
            const active = pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href));
            return (
              <button key={n.href} onClick={() => router.push(n.href)}
                className={`nav-btn ${active ? "nav-btn-active" : "nav-btn-inactive"}`}>
                {n.icon} {n.label}
              </button>
            );
          })}
        </nav>

        {/* Right: user + actions */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-muted hidden md:block">{user.username}</span>
          <span className={`px-1.5 py-0.5 rounded text-[9px] border hidden sm:inline ${
            user.role === "admin"
              ? "border-accent/30 text-accent bg-accent/10"
              : "border-border text-muted"
          }`}>{user.role}</span>
          <button onClick={() => setShowCPW(true)}
            className="nav-btn nav-btn-inactive" title="Change password">🔑</button>
          <button onClick={handleLogout}
            className="text-xs text-danger px-2 py-1 rounded hover:bg-danger/10 transition-colors">
            Sign out
          </button>
        </div>
      </header>

      {/* ── Page content ── */}
      {/* pb-14 on mobile to clear the bottom nav bar */}
      <main className="flex-1 overflow-hidden sm:pb-0 pb-14">{children}</main>

      {/* ── Mobile bottom nav ── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 bg-surface border-t border-border
                      flex z-40 shrink-0">
        {nav.map((n) => {
          const active = pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href));
          return (
            <button key={n.href} onClick={() => router.push(n.href)}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px]
                transition-colors ${active ? "text-accent" : "text-muted"}`}>
              <span className="text-lg leading-none">{n.icon}</span>
              <span>{n.label}</span>
            </button>
          );
        })}
      </nav>

      {showCPW && <ChangePasswordModal onClose={() => setShowCPW(false)} />}
    </div>
  );
}
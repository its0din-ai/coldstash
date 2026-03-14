"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveToken, getToken } from "@/lib/client-fetch";
import { Suspense } from "react";

// 1. Inner Component that uses useSearchParams
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) { setError("Please enter username and password."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Login failed"); return; }
      saveToken(data.token, data.username, data.role);
      
      // This line now works because we are inside Suspense
      const from = searchParams.get("from") ?? "/";
      router.push(from);
    } catch {
      setError("Server unreachable.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-8">
      <h1 className="section-label mb-6">Sign In</h1>

      {error && (
        <div className="mb-5 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-xs">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4" autoComplete="on">
        <div>
          <label className="block text-xs text-muted mb-1.5">Username</label>
          <input
            className="input-base"
            type="text"
            autoComplete="username"
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Password</label>
          <div className="relative">
            <input
              className="input-base pr-10"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors text-xs"
            >
              {showPw ? "🙈" : "👁"}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full mt-2 flex items-center justify-center gap-2">
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}

// 2. Main Page Component with Suspense Wrapper
export default function LoginPage() {
  const router = useRouter();
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';
  const isDev = process.env.NODE_ENV === 'development';

  // Redirect if already logged in
  useEffect(() => {
    if (getToken()) router.replace("/");
  }, [router]);

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-6">
      <div className="w-full max-w-sm animate-fade-up">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="font-display text-3xl font-extrabold tracking-tight">
            <span className="text-accent">Cold</span>
            <span className="text-ink">Stash</span>
          </div>
          <p className="text-muted text-xs mt-2 tracking-widest uppercase">Multi-Disk File Search</p>
        </div>

        {/* Wrap the component using useSearchParams in Suspense */}
        <Suspense fallback={<div className="card p-8 text-center text-muted text-sm">Loading...</div>}>
          <LoginForm />
        </Suspense>

        <p className="text-center text-muted text-xs mt-6">
          · ColdStash v{appVersion}{isDev ? '-(dev)' : ''} ·
        </p>
      </div>
    </div>
  );
}
/**
 * lib/client-fetch.ts
 * Typed API client for use in Client Components.
 * Reads token from localStorage and attaches it as Bearer header.
 * On 401 → clears token and redirects to /login.
 */

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("di_token");
}

export function saveToken(token: string, username: string, role: string) {
  localStorage.setItem("di_token",    token);
  localStorage.setItem("di_username", username);
  localStorage.setItem("di_role",     role);
}

export function clearToken() {
  localStorage.removeItem("di_token");
  localStorage.removeItem("di_username");
  localStorage.removeItem("di_role");
}

export function getStoredUser(): { username: string; role: string } | null {
  if (typeof window === "undefined") return null;
  const username = localStorage.getItem("di_username");
  const role     = localStorage.getItem("di_role");
  if (!username || !role) return null;
  return { username, role };
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get:    <T>(url: string)                        => apiFetch<T>(url),
  post:   <T>(url: string, body: unknown)         => apiFetch<T>(url, { method: "POST",   body: JSON.stringify(body) }),
  delete: <T>(url: string)                        => apiFetch<T>(url, { method: "DELETE" }),
};

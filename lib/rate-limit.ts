/**
 * lib/rate-limit.ts
 * SQLite-backed sliding window rate limiter.
 * OWASP A07: protects login endpoint from brute-force.
 */
import { getDb } from "./db";

const WINDOW_SECONDS = 60;
const MAX_ATTEMPTS   = 10;

export function checkRateLimit(ip: string): boolean {
  const db   = getDb();
  const now  = Math.floor(Date.now() / 1000);
  const win  = now - (now % WINDOW_SECONDS);

  const row = db
    .prepare("SELECT attempts FROM rate_limit WHERE ip=? AND window_start=?")
    .get(ip, win) as { attempts: number } | undefined;

  if (row && row.attempts >= MAX_ATTEMPTS) return false;

  if (row) {
    db.prepare("UPDATE rate_limit SET attempts=attempts+1 WHERE ip=? AND window_start=?")
      .run(ip, win);
  } else {
    db.prepare("INSERT OR IGNORE INTO rate_limit (ip,window_start,attempts) VALUES (?,?,1)")
      .run(ip, win);
  }
  return true;
}

/** Clean up old rate limit windows (call periodically or on startup). */
export function pruneRateLimit(): void {
  const cutoff = Math.floor(Date.now() / 1000) - WINDOW_SECONDS * 2;
  getDb().prepare("DELETE FROM rate_limit WHERE window_start < ?").run(cutoff);
}

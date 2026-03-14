/**
 * lib/audit.ts
 * Structured JSON audit logging to logging/audit.log.
 * Rotates files via simple size check.
 */
import fs from "fs";
import path from "path";

const LOG_DIR  = process.env.LOG_DIR ?? path.join(process.cwd(), "logging");
const LOG_FILE = path.join(LOG_DIR, "audit.log");
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export type AuditEvent =
  | "login_success"
  | "login_failed"
  | "logout"
  | "rate_limited"
  | "token_invalid"
  | "index_imported"
  | "index_deleted"
  | "user_created"
  | "user_deleted"
  | "password_changed"
  | "access_denied"
  | "search";

export interface AuditEntry {
  ts:    string;
  event: AuditEvent;
  ip:    string;
  user:  string;
  [key: string]: unknown;
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function rotate() {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size > MAX_BYTES) {
      fs.renameSync(LOG_FILE, `${LOG_FILE}.${Date.now()}.bak`);
    }
  } catch { /* file doesn't exist yet */ }
}

export function writeAudit(
  event: AuditEvent,
  ip: string,
  user: string,
  extra: Record<string, unknown> = {}
): void {
  ensureLogDir();
  rotate();
  const entry: AuditEntry = {
    ts:    new Date().toISOString(),
    event,
    ip,
    user,
    ...extra,
  };
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    console.error("[audit] write failed:", err);
  }
}

export function readAuditLog(n: number): AuditEntry[] {
  ensureLogDir();
  if (!fs.existsSync(LOG_FILE)) return [];
  const raw = fs.readFileSync(LOG_FILE, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const tail  = lines.slice(-n);
  return tail
    .map((l) => {
      try { return JSON.parse(l) as AuditEntry; }
      catch { return { ts: "", event: "login_success" as AuditEvent, ip: "", user: "", raw: l }; }
    })
    .reverse(); // newest first
}

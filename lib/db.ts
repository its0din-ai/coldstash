/**
 * lib/db.ts
 * SQLite database singleton using better-sqlite3 (synchronous, safe for Next.js API routes).
 * WAL mode for concurrent reads. Foreign keys enforced.
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from 'crypto';

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "coldstash.db");

// Module-level singleton — reused across hot reloads in dev
const globalForDb = global as typeof global & { __db?: Database.Database };

function openDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  return db;
}

export function getDb(): Database.Database {
  if (!globalForDb.__db) {
    globalForDb.__db = openDb();
    runMigrations(globalForDb.__db);
  }
  return globalForDb.__db;
}

// ── Schema / migrations ────────────────────────────────────────────────────────

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version  INTEGER NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'viewer'
                    CHECK(role IN ('viewer','admin')),
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      last_login    TEXT,
      active        INTEGER NOT NULL DEFAULT 1
                    CHECK(active IN (0,1))
    );

    CREATE TABLE IF NOT EXISTS disks (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      label                TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      disk_path            TEXT,
      indexed_at           TEXT,
      total_files          INTEGER NOT NULL DEFAULT 0,
      total_size_gb        REAL    NOT NULL DEFAULT 0,
      archives_scanned     INTEGER NOT NULL DEFAULT 0,
      archive_file_count   INTEGER NOT NULL DEFAULT 0,
      imported_at          TEXT    NOT NULL DEFAULT (datetime('now')),
      imported_by          TEXT
    );

    CREATE TABLE IF NOT EXISTS files (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      disk_id         INTEGER NOT NULL REFERENCES disks(id) ON DELETE CASCADE,
      name            TEXT    NOT NULL,
      path            TEXT    NOT NULL,
      size            INTEGER NOT NULL DEFAULT 0,
      modified        TEXT,
      ext             TEXT,
      type            TEXT    NOT NULL DEFAULT 'other'
                      CHECK(type IN ('document','photo','video','audio','archive','code','other')),
      inside_archive  INTEGER NOT NULL DEFAULT 0 CHECK(inside_archive IN (0,1)),
      archive_type    TEXT
    );

    CREATE TABLE IF NOT EXISTS search_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      ts           TEXT    NOT NULL DEFAULT (datetime('now')),
      username     TEXT    NOT NULL,
      query        TEXT    NOT NULL DEFAULT '',
      file_type    TEXT    NOT NULL DEFAULT 'all',
      result_count INTEGER NOT NULL DEFAULT 0,
      duration_ms  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS rate_limit (
      ip           TEXT    NOT NULL,
      window_start INTEGER NOT NULL,
      attempts     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (ip, window_start)
    );

    CREATE INDEX IF NOT EXISTS idx_files_disk    ON files(disk_id);
    CREATE INDEX IF NOT EXISTS idx_files_name    ON files(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_files_type    ON files(type);
    CREATE INDEX IF NOT EXISTS idx_files_ext     ON files(ext);
    CREATE INDEX IF NOT EXISTS idx_files_archive ON files(inside_archive);
    CREATE INDEX IF NOT EXISTS idx_search_log_ts ON search_log(ts DESC);
  `);

  seedAdmin(db);
}

function seedAdmin(db: Database.Database): void {
  const count = (
    db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }
  ).c;

  if (count !== 0) return;

  const bcrypt = require("bcryptjs") as typeof import("bcryptjs");

  let password = process.env.ADMIN_PASSWORD;
  const usingEnv = !!password;

  if (!password) {
    password = crypto.randomBytes(16).toString("hex");
  }

  const hash = bcrypt.hashSync(password, 12);
  db.prepare(
    "INSERT INTO users (username, password_hash, role) VALUES (?,?,?)"
  ).run("administrator", hash, "admin");

  if (usingEnv) {
    console.log("✅ Admin user created using ADMIN_PASSWORD env variable.");
    console.log("   Username: administrator");
  } else {
    // Write to the data volume directory so it persists and is accessible
    // from the host via: docker compose cp <service>:/app/data/.admin_password ./
    const dataDir = process.env.LOG_DIR
      ? path.dirname(process.env.DB_PATH ?? "/app/data/diskindex.db")
      : path.join(process.cwd(), "data");

    // Ensure the directory exists
    fs.mkdirSync(dataDir, { recursive: true });

    const filePath = path.join(dataDir, ".admin_password");
    fs.writeFileSync(filePath, password + "\n", { mode: 0o600 });

    console.log("\n⚠️  First run — admin user created.");
    console.log("   Username: administrator");
    console.log(`   Password: written to '${filePath}' inside the container`);
    console.log("");
    console.log("   Read it from the host with:");
    console.log(`   docker compose cp coldstash:'${filePath}' ./`);
    console.log("   (Delete the file after you have noted the password)\n");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createGunzip } from "zlib";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { ImportIndexSchema } from "@/lib/validate";
import { getIp, validationError, serverError } from "@/lib/api-helpers";

// How many file records to insert per SQLite transaction batch.
// 10k is a safe balance: low RAM use, still fast (~200ms per batch).
const BATCH_SIZE = 10_000;

// GET /api/disks
export async function GET(req: NextRequest) {
  const { error } = await requireSession(req);
  if (error) return error;

  const rows = getDb()
    .prepare(`SELECT id, label, disk_path, indexed_at, total_files, total_size_gb,
                     archives_scanned, archive_file_count, imported_at, imported_by
              FROM disks ORDER BY label COLLATE NOCASE`)
    .all();

  return Response.json(rows);
}

// POST /api/disks — accepts both plain JSON and gzip-compressed JSON
export async function POST(req: NextRequest) {
  const { session, error } = await requireSession(req);
  if (error) return error;

  const ip = getIp(req);

  // ── Decompress + parse ─────────────────────────────────────────────────────
  let body: unknown;
  try {
    const encoding = req.headers.get("content-encoding") ?? "";
    const isGzip   = encoding.toLowerCase().includes("gzip");

    if (isGzip) {
      // Stream-decompress using Node zlib — avoids loading full payload into RAM
      const arrayBuf = await req.arrayBuffer();
      const gunzip   = createGunzip();
      const source   = Readable.from(Buffer.from(arrayBuf));
      const chunks:  Buffer[] = [];

      gunzip.on("data", (chunk: Buffer) => chunks.push(chunk));
      await pipeline(source, gunzip);

      const json = Buffer.concat(chunks).toString("utf8");
      body = JSON.parse(json);
    } else {
      body = await req.json();
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error:  "Failed to read request body",
        detail: msg.slice(0, 200),
        hint:   "Ensure the file is valid JSON (or valid gzip-compressed JSON) "
               + "and set Content-Encoding: gzip if uploading compressed.",
      },
      { status: 400 }
    );
  }

  // ── Validate ───────────────────────────────────────────────────────────────
  const parsed = ImportIndexSchema.safeParse(body);

  if (!parsed.success) {
    const summary = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(" | ");

    console.warn(`[import] Validation failed for user=${session.username} — ${summary}`);

    writeAudit("index_imported", ip, session.username, {
      status: "validation_failed",
      issues: parsed.error.issues.slice(0, 10).map((issue) => ({
        path:    issue.path.map((p) => String(p)).join("."),
        message: issue.message,
      })),
    });

    return validationError(parsed.error);
  }

  const data  = parsed.data;
  const label = data.disk_label.trim();
  const db    = getDb();

  // ── Upsert disk record ─────────────────────────────────────────────────────
  try {
    let diskId: number;

    const existing = db
      .prepare("SELECT id FROM disks WHERE label=? COLLATE NOCASE")
      .get(label) as { id: number } | undefined;

    if (existing) {
      diskId = existing.id;
      db.prepare(`
        UPDATE disks
        SET disk_path=?, indexed_at=?, total_files=?, total_size_gb=?,
            archives_scanned=?, archive_file_count=?,
            imported_at=datetime('now'), imported_by=?
        WHERE id=?
      `).run(
        data.disk_path         ?? null,
        data.indexed_at        ?? null,
        data.total_files       ?? 0,
        data.total_size_gb     ?? 0,
        data.archives_scanned  ?? 0,
        data.archive_file_count ?? 0,
        session.username,
        diskId,
      );
      db.prepare("DELETE FROM files WHERE disk_id=?").run(diskId);
    } else {
      const info = db.prepare(`
        INSERT INTO disks
          (label, disk_path, indexed_at, total_files, total_size_gb,
           archives_scanned, archive_file_count, imported_by)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(
        label,
        data.disk_path         ?? null,
        data.indexed_at        ?? null,
        data.total_files       ?? 0,
        data.total_size_gb     ?? 0,
        data.archives_scanned  ?? 0,
        data.archive_file_count ?? 0,
        session.username,
      );
      diskId = info.lastInsertRowid as number;
    }

    // ── Chunked batch insert ─────────────────────────────────────────────────
    // Insert in batches of BATCH_SIZE so RAM stays flat regardless of file count.
    // Each batch is a single SQLite transaction (~10ms per 10k rows).
    const insert = db.prepare(`
      INSERT INTO files
        (disk_id, name, path, size, modified, ext, type, inside_archive, archive_type)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);

    const insertBatch = db.transaction((batch: typeof data.files) => {
      for (const f of batch) {
        insert.run(
          diskId,
          f.name,
          f.path,
          f.size           ?? 0,
          f.modified       ?? null,
          f.ext            ?? null,
          f.type           ?? "other",
          f.inside_archive ? 1 : 0,
          f.archive_type   ?? null,
        );
      }
    });

    const files       = data.files;
    const total       = files.length;
    let   inserted    = 0;

    while (inserted < total) {
      const batch = files.slice(inserted, inserted + BATCH_SIZE);
      insertBatch(batch);
      inserted += batch.length;
    }

    writeAudit("index_imported", ip, session.username, {
      label,
      files:  total,
      status: "success",
    });

    return NextResponse.json(
      { ok: true, disk_id: diskId, files_imported: total },
      { status: 201 }
    );

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[import] DB error:", msg);
    writeAudit("index_imported", ip, session.username, {
      label,
      status: "db_error",
      error:  msg.slice(0, 200),
    });
    return serverError(`Import failed: ${msg.slice(0, 120)}`);
  }
}
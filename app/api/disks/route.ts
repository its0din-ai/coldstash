import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { ImportIndexSchema } from "@/lib/validate";
import { getIp, validationError, serverError } from "@/lib/api-helpers";

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

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession(req);
  if (error) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        error:  "Invalid JSON",
        detail: "The request body could not be parsed as JSON. "
               + "Make sure the file is valid JSON and was not truncated.",
      },
      { status: 400 }
    );
  }

  const parsed = ImportIndexSchema.safeParse(body);

  if (!parsed.success) {
    const summary = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(" | ");

    console.warn(`[import] Validation failed for user=${session.username} — ${summary}`);

    writeAudit("index_imported", getIp(req), session.username, {
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

  try {
    const upsert = db.transaction(() => {
      const existing = db
        .prepare("SELECT id FROM disks WHERE label=? COLLATE NOCASE")
        .get(label) as { id: number } | undefined;

      let diskId: number;
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

      const insert = db.prepare(`
        INSERT INTO files
          (disk_id, name, path, size, modified, ext, type, inside_archive, archive_type)
        VALUES (?,?,?,?,?,?,?,?,?)
      `);

      for (const f of data.files) {
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

      return diskId;
    });

    const diskId = upsert();

    writeAudit("index_imported", getIp(req), session.username, {
      label,
      files:  data.files.length,
      status: "success",
    });

    return NextResponse.json(
      { ok: true, disk_id: diskId, files_imported: data.files.length },
      { status: 201 }
    );

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[import] DB error:", msg);
    writeAudit("index_imported", getIp(req), session.username, {
      label,
      status: "db_error",
      error:  msg.slice(0, 200),
    });
    return serverError(`Import failed: ${msg.slice(0, 120)}`);
  }
}
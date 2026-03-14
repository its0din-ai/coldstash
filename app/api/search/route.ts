import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { SearchQuerySchema } from "@/lib/validate";
import { validationError } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession(req);
  if (error) return error;

  const raw    = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = SearchQuerySchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  const { q, type, disk_id, archived, page, per_page } = parsed.data;
  const offset = (page - 1) * per_page;
  const t0     = Date.now();

  const db         = getDb();
  const conditions: string[] = [];
  const params:     unknown[] = [];

  if (archived === "0") { conditions.push("f.inside_archive = 0"); }
  if (type !== "all")   { conditions.push("f.type = ?");  params.push(type); }
  if (disk_id)          { conditions.push("f.disk_id = ?"); params.push(disk_id); }

  if (q) {
    if (q.startsWith("*.")) {
      conditions.push("f.ext = ?");
      params.push(q.slice(1)); // keep the dot e.g. ".mp4"
    } else {
      conditions.push("(f.name LIKE ? ESCAPE '\\' OR f.path LIKE ? ESCAPE '\\')");
      const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
      params.push(like, like);
    }
  }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

  const { total } = db.prepare(
    `SELECT COUNT(*) as total FROM files f JOIN disks d ON d.id=f.disk_id ${where}`
  ).get(...params) as { total: number };

  const rows = db.prepare(
    `SELECT f.id, f.name, f.path, f.size, f.modified, f.ext, f.type,
            f.inside_archive, f.archive_type,
            d.label as disk_label, d.disk_path
     FROM files f JOIN disks d ON d.id=f.disk_id
     ${where}
     ORDER BY f.name COLLATE NOCASE
     LIMIT ? OFFSET ?`
  ).all(...params, per_page, offset);

  const duration_ms = Date.now() - t0;

  // Log search (non-blocking)
  db.prepare(
    `INSERT INTO search_log (username,query,file_type,result_count,duration_ms)
     VALUES (?,?,?,?,?)`
  ).run(session.username, q ?? "", type, total, duration_ms);

  const results = rows.map((r: any) => ({
    id:             r.id,
    name:           r.name,
    path:           r.path,
    size:           r.size,
    modified:       r.modified,
    ext:            r.ext,
    type:           r.type,
    inside_archive: r.inside_archive === 1,
    archive_type:   r.archive_type,
    disk_label:     r.disk_label,
    disk_path:      r.disk_path,
  }));

  return Response.json({
    results,
    total,
    page,
    per_page,
    pages:       Math.ceil(total / per_page),
    duration_ms,
    query:       q ?? "",
  });
}

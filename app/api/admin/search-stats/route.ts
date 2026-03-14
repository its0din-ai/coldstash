import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { error } = await requireSession(req, "admin");
  if (error) return error;

  const rows = getDb()
    .prepare(`SELECT id, ts, username, query, file_type, result_count, duration_ms
              FROM search_log ORDER BY ts DESC LIMIT 200`)
    .all();
  return Response.json(rows);
}

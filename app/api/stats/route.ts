import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { error } = await requireSession(req);
  if (error) return error;

  const db = getDb();
  const disks        = (db.prepare("SELECT COUNT(*) as c FROM disks").get() as { c: number }).c;
  const total_files  = (db.prepare("SELECT COUNT(*) as c FROM files").get() as { c: number }).c;
  const archived     = (db.prepare("SELECT COUNT(*) as c FROM files WHERE inside_archive=1").get() as { c: number }).c;
  const gb_row       = db.prepare("SELECT COALESCE(SUM(total_size_gb),0) as gb FROM disks").get() as { gb: number };

  return Response.json({
    disks,
    total_files,
    archived_files: archived,
    total_gb:       Math.round(gb_row.gb * 100) / 100,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getIp } from "@/lib/api-helpers";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireSession(req, "admin");
  if (error) return error;

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const disk = db.prepare("SELECT label FROM disks WHERE id=?").get(id) as
    | { label: string }
    | undefined;

  if (!disk) return NextResponse.json({ error: "Disk not found" }, { status: 404 });

  db.prepare("DELETE FROM disks WHERE id=?").run(id);
  writeAudit("index_deleted", getIp(req), session.username, { label: disk.label });
  return NextResponse.json({ ok: true });
}

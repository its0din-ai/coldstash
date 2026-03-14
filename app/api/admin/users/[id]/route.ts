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
  if (id === Number(session.sub)) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  const db = getDb();
  const user = db.prepare("SELECT username FROM users WHERE id=?").get(id) as
    | { username: string } | undefined;

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  db.prepare("DELETE FROM users WHERE id=?").run(id);
  writeAudit("user_deleted", getIp(req), session.username, { deleted: user.username });
  return NextResponse.json({ ok: true });
}

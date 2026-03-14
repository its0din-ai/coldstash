import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ChangePasswordSchema } from "@/lib/validate";
import { getIp, validationError } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession(req);
  if (error) return error;

  const body   = await req.json().catch(() => null);
  const parsed = ChangePasswordSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { old_password, new_password } = parsed.data;
  const db = getDb();

  const user = db
    .prepare("SELECT password_hash FROM users WHERE id=?")
    .get(Number(session.sub)) as { password_hash: string } | undefined;

  if (!user || !(await bcrypt.compare(old_password, user.password_hash))) {
    writeAudit("password_changed", getIp(req), session.username, { status: "failed" });
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }

  const newHash = await bcrypt.hash(new_password, 12);
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(newHash, Number(session.sub));
  writeAudit("password_changed", getIp(req), session.username, { status: "success" });
  return NextResponse.json({ ok: true });
}

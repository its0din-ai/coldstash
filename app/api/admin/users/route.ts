import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { CreateUserSchema } from "@/lib/validate";
import { getIp, validationError } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession(req, "admin");
  if (error) return error;

  const rows = getDb()
    .prepare("SELECT id, username, role, created_at, last_login, active FROM users ORDER BY username COLLATE NOCASE")
    .all();
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession(req, "admin");
  if (error) return error;

  const body   = await req.json().catch(() => null);
  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { username, password, role } = parsed.data;
  const hash = await bcrypt.hash(password, 12);
  const db   = getDb();

  try {
    db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?,?,?)").run(username, hash, role);
  } catch {
    return NextResponse.json({ error: "Username already exists" }, { status: 409 });
  }

  writeAudit("user_created", getIp(req), session.username, { new_user: username, role });
  return NextResponse.json({ ok: true }, { status: 201 });
}

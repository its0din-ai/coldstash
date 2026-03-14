import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { signToken, buildSessionCookie } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";
import { LoginSchema } from "@/lib/validate";
import { getIp, validationError } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  const ip = getIp(req);

  // Rate limit — OWASP A07
  if (!checkRateLimit(ip)) {
    writeAudit("rate_limited", ip, "anonymous");
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // Validate input — OWASP A03
  const body   = await req.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { username, password } = parsed.data;
  const db   = getDb();

  // Constant-time user lookup to prevent timing oracle
  const user = db
    .prepare("SELECT id, username, password_hash, role, active FROM users WHERE username=? COLLATE NOCASE")
    .get(username) as
    | { id: number; username: string; password_hash: string; role: string; active: number }
    | undefined;

  // Always run bcrypt (even for non-existent user) to prevent timing attacks
  const dummyHash = "$2a$12$invalidhashfortimingprotection000000000000000000000000";
  const hashToCheck = user?.password_hash ?? dummyHash;
  const match = await bcrypt.compare(password, hashToCheck);

  if (!user || !user.active || !match) {
    writeAudit("login_failed", ip, username);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Sign JWT
  const token = await signToken({
    sub:      String(user.id),
    username: user.username,
    role:     user.role as "viewer" | "admin",
  });

  // Update last_login
  db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(user.id);
  writeAudit("login_success", ip, user.username, { role: user.role });

  // Set httpOnly cookie + return token in body (caller can use either)
  const res = NextResponse.json({
    ok:       true,
    username: user.username,
    role:     user.role,
    token,    // returned so SPA can store it if needed
  });
  res.headers.set("Set-Cookie", buildSessionCookie(token));
  return res;
}

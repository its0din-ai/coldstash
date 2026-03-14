/**
 * lib/auth.ts
 * Authentication helpers:
 *  - JWT sign/verify using jose (works in Edge + Node runtimes)
 *  - Session extraction from Next.js request
 *  - RBAC role assertions
 *  - OWASP A07: Identification & Authentication Failures mitigations
 */
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// ── Config ─────────────────────────────────────────────────────────────────────

const RAW_SECRET = process.env.JWT_SECRET;
if (!RAW_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET env var is required in production");
}
const SECRET_BYTES = new TextEncoder().encode(
  RAW_SECRET ?? "dev-secret-change-me-in-production-min-32-chars!!"
);

const COOKIE_NAME   = "di_session";
const JWT_ALGORITHM = "HS256";
const JWT_EXPIRY    = "8h";

// ── Types ──────────────────────────────────────────────────────────────────────

export type Role = "viewer" | "admin";

export interface SessionPayload extends JWTPayload {
  sub:      string;   // user id (string for JWT compat)
  username: string;
  role:     Role;
}

// ── Token helpers ──────────────────────────────────────────────────────────────

export async function signToken(payload: Omit<SessionPayload, keyof JWTPayload>): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .setJti(crypto.randomUUID())
    .sign(SECRET_BYTES);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_BYTES, {
      algorithms: [JWT_ALGORITHM],
    });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

// ── Session from cookie ────────────────────────────────────────────────────────

/** Read & verify session from the httpOnly cookie (Server Components / API routes). */
export async function getSession(): Promise<SessionPayload | null> {
  const store  = await cookies();
  const cookie = store.get(COOKIE_NAME);
  if (!cookie?.value) return null;
  return verifyToken(cookie.value);
}

/** Read session from Authorization: Bearer header (API routes). */
export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return verifyToken(token);
  }
  // Fallback: cookie
  const cookie = req.cookies.get(COOKIE_NAME);
  if (cookie?.value) return verifyToken(cookie.value);
  return null;
}

// ── RBAC helpers ───────────────────────────────────────────────────────────────

/** Returns session or a 401/403 Response. Use in API routes. */
export async function requireSession(
  req: NextRequest,
  requiredRole?: Role
): Promise<{ session: SessionPayload; error?: never } | { session?: never; error: NextResponse }> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (requiredRole && session.role !== requiredRole) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { session };
}

// ── Cookie management ──────────────────────────────────────────────────────────

export function buildSessionCookie(token: string): string {
  const isProd = process.env.NODE_ENV === "production";
  const maxAge = 8 * 60 * 60; // 8 hours
  const flags  = [
    `Max-Age=${maxAge}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    isProd ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
  return `${COOKIE_NAME}=${token}; ${flags}`;
}

export function buildClearCookie(): string {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict`;
}

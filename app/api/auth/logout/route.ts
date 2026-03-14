import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, buildClearCookie } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { getIp } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  writeAudit("logout", getIp(req), session?.username ?? "anonymous");
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", buildClearCookie());
  return res;
}

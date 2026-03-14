import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { readAuditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const { error } = await requireSession(req, "admin");
  if (error) return error;

  const n = Math.min(500, parseInt(req.nextUrl.searchParams.get("n") ?? "100", 10) || 100);
  return Response.json(readAuditLog(n));
}

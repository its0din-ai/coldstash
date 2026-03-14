import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession(req);
  if (error) return error;
  return Response.json({ username: session.username, role: session.role });
}

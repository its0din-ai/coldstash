import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const start = Date.now();

  // Probe the database — if this fails the container is unhealthy
  try {
    getDb().prepare("SELECT 1").get();
  } catch (err) {
    return NextResponse.json(
      { status: "unhealthy", error: "database unreachable" },
      { status: 503 }
    );
  }

  return NextResponse.json({
    status:   "ok",
    uptime_s: Math.floor(process.uptime()),
    db:       "ok",
    latency_ms: Date.now() - start,
  });
}
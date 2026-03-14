/**
 * lib/api-helpers.ts
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function getIp(req: Request): string {
  const xfwd = (req.headers as Headers).get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0].trim();
  return "unknown";
}

export function validationError(err: ZodError): NextResponse {
  return NextResponse.json(
    { error: "Validation failed", details: err.flatten().fieldErrors },
    { status: 400 }
  );
}

export function serverError(msg = "Internal server error"): NextResponse {
  return NextResponse.json({ error: msg }, { status: 500 });
}

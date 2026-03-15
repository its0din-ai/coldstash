import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { z } from "zod";

export function getIp(req: Request): string {
  const xfwd = (req.headers as Headers).get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0].trim();
  return "unknown";
}

export function validationError(err: ZodError): NextResponse {
  const issues = err.issues.map((issue) => ({
    path: issue.path
      .map((p) => (typeof p === "number" ? `[${p}]` : String(p)))
      .join(".")
      .replace(/\.\[/g, "["),
    message:  issue.message,
    code:     issue.code,
    ...("received" in issue && issue.received !== undefined
      ? { received: String(issue.received).slice(0, 64) }
      : {}),
  }));

  return NextResponse.json(
    {
      error:  "Validation failed",
      issues,
      detail: issues[0]
        ? `${issues[0].path || "(root)"}: ${issues[0].message}`
        : "Unknown validation error",
    },
    { status: 400 }
  );
}

export function serverError(msg = "Internal server error"): NextResponse {
  return NextResponse.json({ error: msg }, { status: 500 });
}
// instrumentation.ts
//
// Next.js calls this file once on server startup, before any requests are handled.
// We use it to eagerly initialize the database so the seed runs immediately
// on first boot — not lazily on the first incoming request.
//
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // Only run in the Node.js runtime (not edge), and only on the server
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getDb } = await import("@/lib/db");
    getDb(); // triggers runMigrations() and the admin seed inside lib/db.ts
  }
}
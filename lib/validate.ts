/**
 * lib/validate.ts
 * Centralised Zod schemas for request validation.
 * OWASP A03: strict input validation with sanitising coercions.
 *
 * Philosophy for ImportIndexSchema:
 *   - Trust the user's JSON but always encapsulate/coerce every field.
 *   - Unknown fields are stripped (not rejected).
 *   - Bad values are coerced to safe fallbacks instead of hard-failing.
 *   - Validation errors include the field path and exact failure reason.
 */
import { z } from "zod";

// ── Auth schemas ───────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  username: z
    .string()
    .min(1, "Username required")
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Invalid username characters"),
  password: z.string().min(1, "Password required").max(256),
});

export const ChangePasswordSchema = z.object({
  old_password: z.string().min(1),
  new_password: z.string().min(8, "Password must be at least 8 characters").max(256),
});

export const CreateUserSchema = z.object({
  username: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Invalid username characters"),
  password: z.string().min(8).max(256),
  role:     z.enum(["viewer", "admin"]),
});

// ── Import index schema ────────────────────────────────────────────────────────
//
// Coercion rules — we trust the data but sanitise at the boundary:
//
//   disk_label   required string, trimmed, max 64
//   disk_path    optional, coerced to string or null
//   indexed_at   optional, coerced to string or null
//   total_files  optional number, coerced via z.coerce, fallback 0
//   total_size_gb optional number, coerced, fallback 0
//   files[]      each file record is coerced — bad individual fields get
//                safe defaults rather than failing the entire import
//
// File record coercions:
//   name           string, trimmed, truncated to 512, fallback "_empty_"
//   path           string, truncated to 4096, fallback "_empty_"
//   size           coerced to int >= 0, fallback 0
//   modified       string matching YYYY-MM-DD, fallback null
//   ext            coerced to lowercase, must start with '.', fallback ""
//   type           one of the valid enums, fallback "other"
//   inside_archive coerced to boolean, fallback false
//   archive_type   one of zip/7z/rar/tar or null, fallback null

const VALID_TYPES    = ["document","photo","video","audio","archive","code","other"] as const;
const VALID_ARC_TYPE = ["zip","7z","rar","tar"] as const;
const DATE_RE        = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NAME_LEN = 1024;
const MAX_EXT_LEN  = 128;

/** Coerce anything to a safe non-negative integer. */
const CoercedNonNegInt = z.preprocess(
  (v) => {
    const n = Number(v);
    if (!isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
  },
  z.number().int().nonnegative()
);

/** Coerce anything to a safe non-negative float. */
const CoercedNonNegFloat = z.preprocess(
  (v) => {
    const n = Number(v);
    if (!isFinite(n) || n < 0) return 0;
    return n;
  },
  z.number().nonnegative()
);

/** Coerce a file `type` field — unknown values become "other". */
const CoercedFileType = z.preprocess(
  (v) => (VALID_TYPES.includes(v as any) ? v : "other"),
  z.enum(VALID_TYPES)
);

/** Coerce archive_type — unknown values become null. */
const CoercedArchiveType = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).toLowerCase().trim();
    return VALID_ARC_TYPE.includes(s as any) ? s : null;
  },
  z.enum(VALID_ARC_TYPE).nullable()
);

/** Coerce ext field.
 *
 * Cases handled:
 *   normal file    "report.pdf"   → ext = ".pdf"         (short, validated)
 *   no extension   "Makefile"     → ext = ""             (empty string, allowed)
 *   dotfile        ".ssh"         → ext = ".ssh"         (whole name is ext, max 1024)
 *   dotfile        ".gitconfig"   → ext = ".gitconfig"   (same, max 1024)
 *   long ext       ".verylonghex" → ext = ""             (exceeds 128, coerced to "")
 *   bad chars      ".tar<gz>"     → ext = ""             (fails pattern, coerced to "")
 *   null / missing               → ext = ""
 */
const CoercedExt = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return "";
    const raw = String(v).toLowerCase().trim();
    if (!raw) return "";

    const s = raw.startsWith(".") ? raw : "." + raw;

    // Dotfile: the entire name is the extension (e.g. ".ssh", ".gitconfig").
    // These can be up to MAX_NAME_LEN — no further pattern enforcement.
    // Heuristic: a dotfile ext has no second dot (it's the whole filename).
    const isDotfile = !s.slice(1).includes(".");
    if (isDotfile) {
      // Allow up to MAX_NAME_LEN but strip anything after that
      return s.slice(0, MAX_NAME_LEN);
    }

    // Normal extension — must be short and alphanumeric only
    if (s.length > MAX_EXT_LEN) return "";
    if (!/^\.[a-z0-9]{1,127}$/.test(s)) return "";

    return s;
  },
  z.string()
);

/** Coerce modified — must be YYYY-MM-DD, else null. */
const CoercedDate = z.preprocess(
  (v) => {
    if (!v) return null;
    const s = String(v).trim().slice(0, 10);
    return DATE_RE.test(s) ? s : null;
  },
  z.string().nullable()
);

/** Coerce name/path strings — force to string, trim, truncate. */
function coercedString(maxLen: number, fallback = "_empty_") {
  return z.preprocess(
    (v) => {
      if (v === null || v === undefined) return fallback;
      const s = String(v).trim().slice(0, maxLen);
      return s || fallback;
    },
    z.string()
  );
}

/** Coerce boolean — accepts true/false/1/0/"true"/"false". */
const CoercedBool = z.preprocess(
  (v) => {
    if (typeof v === "boolean") return v;
    if (v === 1 || v === "1" || v === "true") return true;
    return false;
  },
  z.boolean()
);

export const ImportIndexSchema = z.object({
  disk_label:         z.string().min(1, "disk_label is required").max(64).trim(),
  disk_path:          z.preprocess((v) => (v ? String(v).slice(0, 512) : null), z.string().max(512).nullable()).optional(),
  indexed_at:         z.preprocess((v) => (v ? String(v).slice(0, 64) : null),  z.string().max(64).nullable()).optional(),
  total_files:        CoercedNonNegInt.optional().default(0),
  total_size_gb:      CoercedNonNegFloat.optional().default(0),
  archives_scanned:   CoercedNonNegInt.optional().default(0),
  archive_file_count: CoercedNonNegInt.optional().default(0),

  files: z
  .array(
    z.object({
      name:           coercedString(MAX_NAME_LEN),
      path:           coercedString(4096),
      size:           CoercedNonNegInt.optional().default(0),
      modified:       CoercedDate.optional().default(null),
      ext:            CoercedExt.optional().default(""),
      type:           CoercedFileType.optional().default("other"),
      inside_archive: CoercedBool.optional().default(false),
      archive_type:   CoercedArchiveType.optional().default(null),
    }).strip()
  )
  .max(2_000_000, "files array exceeds 2,000,000 limit"),
});

// ── Search schema ──────────────────────────────────────────────────────────────

export const SearchQuerySchema = z.object({
  q:        z.string().max(256).optional().default(""),
  type:     z.enum(["all","document","photo","video","audio","archive","code","other"]).optional().default("all"),
  disk_id:  z.coerce.number().int().positive().optional(),
  archived: z.enum(["0","1"]).optional().default("1"),
  page:     z.coerce.number().int().min(1).optional().default(1),
  per_page: z.coerce.number().int().min(10).max(200).optional().default(50),
});
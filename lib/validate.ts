/**
 * lib/validate.ts
 * Centralised Zod schemas for request validation.
 * OWASP A03: prevents injection via strict input validation.
 */
import { z } from "zod";

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

export const ImportIndexSchema = z.object({
  disk_label:          z.string().min(1).max(64),
  disk_path:           z.string().max(512).optional(),
  indexed_at:          z.string().max(64).optional(),
  total_files:         z.number().int().nonnegative().optional(),
  total_size_gb:       z.number().nonnegative().optional(),
  archives_scanned:    z.number().int().nonnegative().optional(),
  archive_file_count:  z.number().int().nonnegative().optional(),
  files: z.array(
    z.object({
      name:          z.string().max(512),
      path:          z.string().max(4096),
      size:          z.number().int().nonnegative().optional(),
      modified:      z.string().max(32).optional(),
      ext:           z.string().max(32).optional(),
      type:          z.enum(["document","photo","video","audio","archive","code","other"]).optional(),
      inside_archive:z.boolean().optional(),
      archive_type:  z.string().max(16).optional().nullish(),
    })
  ).max(2_000_000),
});

export const SearchQuerySchema = z.object({
  q:        z.string().max(256).optional().default(""),
  type:     z.enum(["all","document","photo","video","audio","archive","code","other"]).optional().default("all"),
  disk_id:  z.coerce.number().int().positive().optional(),
  archived: z.enum(["0","1"]).optional().default("1"),
  page:     z.coerce.number().int().min(1).optional().default(1),
  per_page: z.coerce.number().int().min(10).max(200).optional().default(50),
});

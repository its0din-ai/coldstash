// ── Domain types ───────────────────────────────────────────────────────────────

export type Role = "viewer" | "admin";

export type FileType =
  | "document" | "photo" | "video" | "audio"
  | "archive"  | "code"  | "other";

export interface DiskRecord {
  id:                  number;
  label:               string;
  disk_path:           string | null;
  indexed_at:          string | null;
  total_files:         number;
  total_size_gb:       number;
  archives_scanned:    number;
  archive_file_count:  number;
  imported_at:         string;
  imported_by:         string | null;
}

export interface FileRecord {
  id:             number;
  disk_id:        number;
  name:           string;
  path:           string;
  size:           number;
  modified:       string | null;
  ext:            string | null;
  type:           FileType;
  inside_archive: boolean;
  archive_type:   string | null;
  // joined
  disk_label:     string;
  disk_path:      string | null;
}

export interface SearchResult {
  results:     FileRecord[];
  total:       number;
  page:        number;
  per_page:    number;
  pages:       number;
  duration_ms: number;
  query:       string;
}

export interface GlobalStats {
  disks:          number;
  total_files:    number;
  archived_files: number;
  total_gb:       number;
}

export interface UserRecord {
  id:         number;
  username:   string;
  role:       Role;
  created_at: string;
  last_login: string | null;
  active:     number;
}

export interface SearchLogEntry {
  id:           number;
  ts:           string;
  username:     string;
  query:        string;
  file_type:    string;
  result_count: number;
  duration_ms:  number;
}

export interface AuditEntry {
  ts:    string;
  event: string;
  ip:    string;
  user:  string;
  [key: string]: unknown;
}

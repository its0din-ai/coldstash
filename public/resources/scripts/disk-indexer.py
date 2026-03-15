#!/usr/bin/env python3
"""
disk_indexer.py — ColdStash disk scanner
=========================================
Scans a disk and produces a JSON index file for import into ColdStash.

Usage:
    python disk_indexer.py <label> <path> [options]

Examples:
    python disk_indexer.py Disk00 E:\\
    python disk_indexer.py Disk01 F:\\ --no-archives
    python disk_indexer.py Disk02 G:\\ --index-dir D:\\MyIndexes
    python disk_indexer.py Disk03 E:\\ --throttle low
    python disk_indexer.py Disk04 E:\\ --throttle hdd

Throttle profiles:
    high    — no sleeping, max speed (fast SSD / high-end)
    normal  — light yield every 200 files (default)
    low     — heavier yield, slower redraws (low-end / laptop)
    hdd     — extra micro-sleep between stat() calls (spinning rust)

Requirements (optional, for archive scanning):
    pip install py7zr rarfile
"""

import os
import re
import sys
import json
import time
import math
import shutil
import argparse
import datetime
import unicodedata
from pathlib import Path

# ── Python version guard ──────────────────────────────────────────────────────
if sys.version_info < (3, 8):
    print("Error: Python 3.8 or newer is required.", file=sys.stderr)
    sys.exit(1)

# ── Terminal / colour helpers ─────────────────────────────────────────────────

def _supports_color() -> bool:
    if not hasattr(sys.stdout, "isatty") or not sys.stdout.isatty():
        return False
    if os.environ.get("NO_COLOR"):
        return False
    if sys.platform == "win32":
        try:
            import ctypes
            kernel = ctypes.windll.kernel32          # type: ignore
            kernel.SetConsoleMode(kernel.GetStdHandle(-11), 7)
            return True
        except Exception:
            return False
    return True

COLOR = _supports_color()

def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if COLOR else text

def cyan(t: str)    -> str: return _c("96", t)
def green(t: str)   -> str: return _c("92", t)
def yellow(t: str)  -> str: return _c("93", t)
def red(t: str)     -> str: return _c("91", t)
def bold(t: str)    -> str: return _c("1",  t)
def dim(t: str)     -> str: return _c("2",  t)
def magenta(t: str) -> str: return _c("95", t)

_ANSI_STRIP = re.compile(r"\033\[[0-9;]*[a-zA-Z]|\033[^[]")

def term_width() -> int:
    return shutil.get_terminal_size((80, 24)).columns

def clear_line() -> None:
    if COLOR:
        sys.stdout.write("\r\033[K")
        sys.stdout.flush()

def overwrite(text: str) -> None:
    plain = _ANSI_STRIP.sub("", text)
    width = term_width() - 1
    if len(plain) > width:
        # Trim excess plain chars from the end
        excess = len(plain) - width
        text   = text[: len(text) - excess]
    if COLOR:
        sys.stdout.write(f"\r\033[K{text}")
        sys.stdout.flush()
    else:
        print(text)


# ── Timestamp helpers ─────────────────────────────────────────────────────────

EPOCH_ZERO = "1970-01-01"

_DT_MIN_TS = datetime.datetime(1970,  1,  1, tzinfo=datetime.timezone.utc).timestamp()
_DT_MAX_TS = datetime.datetime(9999, 12, 31, tzinfo=datetime.timezone.utc).timestamp()


def safe_mtime(ts: object) -> str:
    """
    Convert anything to 'YYYY-MM-DD'. Returns EPOCH_ZERO on any error.
    Accepts: int, float, datetime, date, None, NaN, out-of-range values.
    Uses timezone-aware datetime — no deprecated utcfromtimestamp().
    """
    try:
        if isinstance(ts, datetime.datetime):
            return ts.strftime("%Y-%m-%d")
        if isinstance(ts, datetime.date):
            return ts.strftime("%Y-%m-%d")
        if not isinstance(ts, (int, float)):
            return EPOCH_ZERO
        if math.isnan(ts) or math.isinf(ts):
            return EPOCH_ZERO
        if ts < _DT_MIN_TS or ts > _DT_MAX_TS:
            return EPOCH_ZERO
        return datetime.datetime.fromtimestamp(
            ts, tz=datetime.timezone.utc
        ).strftime("%Y-%m-%d")
    except Exception:
        return EPOCH_ZERO


def now_utc_str() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M")


# ── Input sanitisation ────────────────────────────────────────────────────────
#
# Every string that comes from the filesystem or an archive is untrusted.
# Filenames can contain: null bytes, ANSI escapes, control characters,
# path traversal (../../), Unicode direction overrides, RTL markers,
# zero-width characters, homoglyphs, illegal OS chars, and absurd lengths.
# We sanitise everything before it reaches the JSON output.

_WIN_ILLEGAL  = frozenset('<>:"/\\|?*')
_CTRL_RE      = re.compile(r"[\x00-\x1f\x7f]")
_UNICODE_BAD  = re.compile(
    r"[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u206a-\u206f\ufeff\ufff0-\uffff]"
)
_TRAVERSAL_RE = re.compile(r"(\.\.[\\/]|[\\/]\.\.)")
_LABEL_RE     = re.compile(r"[^a-zA-Z0-9_\-. ]")

MAX_NAME_LEN  = 512
MAX_PATH_LEN  = 4096
MAX_EXT_LEN   = 32
MAX_LABEL_LEN = 64


def sanitise_str(s: object, max_len: int = MAX_NAME_LEN) -> str:
    """
    Sanitise any untrusted string.
    1. Force to str
    2. NFC Unicode normalisation (resolves homoglyphs / combining chars)
    3. Strip ANSI escape sequences
    4. Strip Unicode direction overrides / zero-width chars
    5. Strip control characters (null bytes, CR, LF, TAB, etc.)
    6. Strip Windows-illegal filename chars
    7. Strip path traversal sequences
    8. Strip leading/trailing whitespace and dots
    9. Truncate to max_len
    10. Placeholder if result is empty
    """
    if s is None:
        return "_empty_"
    try:
        s = str(s)
    except Exception:
        return "_invalid_"

    try:
        s = unicodedata.normalize("NFC", s)
    except Exception:
        pass

    s = _ANSI_STRIP.sub("", s)
    s = _UNICODE_BAD.sub("", s)
    s = _CTRL_RE.sub("", s)
    s = "".join(c for c in s if c not in _WIN_ILLEGAL)
    s = _TRAVERSAL_RE.sub("", s)
    s = s.strip().strip(".")
    s = s[:max_len]
    return s if s else "_empty_"


def sanitise_label(label: str) -> str:
    label = sanitise_str(label, MAX_LABEL_LEN)
    label = _LABEL_RE.sub("_", label).strip("_. ")
    return label[:MAX_LABEL_LEN] if label else "DISK"


def sanitise_ext(ext: str) -> str:
    ext = sanitise_str(ext, MAX_EXT_LEN).lower()
    if not ext:
        return ""
    if not ext.startswith("."):
        ext = "." + ext
    # Only allow dot + alphanumeric (1–16 chars)
    if not re.match(r"^\.[a-z0-9]{1,16}$", ext):
        return ""
    return ext


def sanitise_path(path: str) -> str:
    path = sanitise_str(path, MAX_PATH_LEN)
    path = _TRAVERSAL_RE.sub("", path)
    return path[:MAX_PATH_LEN]


def sanitise_size(size: object) -> int:
    try:
        return max(0, int(size))
    except Exception:
        return 0


def make_file_record(
    name:           str,
    path:           str,
    size:           object,
    modified:       object,
    ext:            str,
    ftype:          str,
    inside_archive: bool,
    archive_type:   object,
) -> dict:
    """
    Single validated choke-point for all file records.
    Every field is sanitised, typed, and range-checked.
    """
    san_name  = sanitise_str(name, MAX_NAME_LEN)
    san_path  = sanitise_path(path)
    san_ext   = sanitise_ext(ext)
    san_mtime = (
        modified
        if isinstance(modified, str) and re.match(r"^\d{4}-\d{2}-\d{2}$", modified)
        else safe_mtime(modified)
    )
    san_size  = sanitise_size(size)
    san_type  = ftype if ftype in {
        "document","photo","video","audio","archive","code","other"
    } else "other"
    san_atype = None
    if archive_type is not None:
        _at = sanitise_str(str(archive_type), 16).lower()
        san_atype = _at if _at in {"zip","7z","rar","tar"} else None

    return {
        "name":           san_name,
        "path":           san_path,
        "size":           san_size,
        "modified":       san_mtime,
        "ext":            san_ext,
        "type":           san_type,
        "inside_archive": bool(inside_archive),
        "archive_type":   san_atype,
    }


# ── Throttle profiles ─────────────────────────────────────────────────────────
#
# Low-end machines and spinning HDDs need breathing room:
#   yield_every   — sleep after every N files so the OS scheduler can breathe
#   yield_sleep   — seconds to sleep each yield (prevents fan spin / UI freeze)
#   progress_hz   — minimum seconds between progress bar redraws
#   stat_sleep_us — microseconds between stat() calls (seek relief for HDDs)

THROTTLE_PROFILES: dict = {
    #           yield_every  yield_sleep  progress_hz  stat_sleep_us
    "high":   (500,          0.000,       0.08,        0),
    "normal": (200,          0.001,       0.10,        0),
    "low":    (100,          0.005,       0.15,        500),
    "hdd":    ( 50,          0.010,       0.20,        1000),
}

DEFAULT_THROTTLE = "normal"


# ── Progress / ETA ────────────────────────────────────────────────────────────

class Progress:
    SPINNER   = ("⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏")
    BAR_WIDTH = 24

    def __init__(self, progress_hz: float = 0.10) -> None:
        self._spin_i     = 0
        self._start_time = time.monotonic()
        self._last_draw  = 0.0
        self._total      = 0
        self._done       = 0
        self._hz         = progress_hz

    def counting(self, count: int) -> None:
        now = time.monotonic()
        if now - self._last_draw < 0.08:
            return
        self._last_draw = now
        self._spin_i    = (self._spin_i + 1) % len(self.SPINNER)
        overwrite(
            f"  {cyan(self.SPINNER[self._spin_i])}  "
            f"Counting… {dim(f'{count:,} files found')}"
        )

    def set_total(self, total: int) -> None:
        self._total      = total
        self._done       = 0
        self._start_time = time.monotonic()
        self._last_draw  = 0.0

    def update(self, done: int, current_file: str = "") -> None:
        self._done = done
        now        = time.monotonic()
        if now - self._last_draw < self._hz and done < self._total:
            return
        self._last_draw = now

        total    = max(self._total, 1)
        fraction = min(done / total, 1.0)
        elapsed  = now - self._start_time

        eta_str = "—"
        if fraction > 0.002 and elapsed > 1.0:
            eta_secs = (elapsed / fraction) * (1 - fraction)
            eta_str  = _fmt_duration(eta_secs)

        speed_str = f"{done / elapsed:,.0f} f/s" if elapsed > 0 else "—"
        filled    = int(self.BAR_WIDTH * fraction)
        bar       = "█" * filled + "░" * (self.BAR_WIDTH - filled)
        pct       = f"{fraction * 100:5.1f}%"

        fname_display = ""
        if current_file:
            try:
                fname_display = dim(sanitise_str(Path(current_file).name, 60))
            except Exception:
                pass

        overwrite(
            f"  {cyan(bar)} {bold(pct)}  "
            f"{dim(speed_str)}  ETA {yellow(eta_str)}  {fname_display}"
        )

    def finish(self) -> None:
        clear_line()


def _fmt_duration(secs: float) -> str:
    s = max(0, int(secs))
    h, r = divmod(s, 3600)
    m, s = divmod(r, 60)
    if h:  return f"{h}h {m:02d}m {s:02d}s"
    if m:  return f"{m}m {s:02d}s"
    return f"{s}s"


def _fmt_size(n: float) -> str:
    for unit in ("B","KB","MB","GB","TB"):
        if abs(n) < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} PB"


# ── File type classification ──────────────────────────────────────────────────

def _build_ext_map() -> dict:
    m: dict = {}
    for e in [".pdf",".doc",".docx",".odt",".rtf",".txt",".md",".csv",
              ".xls",".xlsx",".ods",".ppt",".pptx",".odp",".epub",".mobi"]:
        m[e] = "document"
    for e in [".jpg",".jpeg",".png",".gif",".bmp",".tiff",".tif",".webp",
              ".heic",".heif",".raw",".cr2",".nef",".arw",".svg",".psd",".dng"]:
        m[e] = "photo"
    for e in [".mp4",".mkv",".avi",".mov",".wmv",".flv",".webm",
              ".m4v",".mpg",".mpeg",".3gp",".ts",".vob"]:
        m[e] = "video"
    for e in [".mp3",".flac",".wav",".aac",".ogg",".wma",".m4a",".opus",".aiff"]:
        m[e] = "audio"
    for e in [".zip",".7z",".rar",".tar",".gz",".bz2",".xz",
              ".tgz",".tbz2",".txz",".iso",".cab"]:
        m[e] = "archive"
    for e in [".py",".js",".ts",".jsx",".tsx",".java",".c",".cpp",".h",".cs",
              ".go",".rs",".rb",".php",".sh",".bat",".ps1",".sql",
              ".html",".css",".json",".xml",".yaml",".yml",".toml"]:
        m[e] = "code"
    return m

EXT_MAP      = _build_ext_map()
SKIP_DIRS    = frozenset({
    "$RECYCLE.BIN","System Volume Information","RECYCLER",
    ".Spotlight-V100",".Trashes",".fseventsd",".TemporaryItems","RECYCLED",
})
ARCHIVE_EXTS = frozenset({
    ".zip",".7z",".rar",".tar",".gz",".bz2",".xz",".tgz",".tbz2",".txz",
})

TYPE_COLOR = {
    "document": cyan,
    "photo":    yellow,
    "video":    magenta,
    "audio":    green,
    "archive":  lambda t: _c("33", t),
    "code":     lambda t: _c("94", t),
    "other":    dim,
}


def classify(ext: str) -> str:
    return EXT_MAP.get(ext, "other")


# ── Archive scanning ──────────────────────────────────────────────────────────

def scan_archive(
    archive_path:  Path,
    rel_path:      str,      # already sanitised by caller
    stat_sleep_us: int,
) -> list:
    """
    Scan archive members. All member filenames are sanitised via make_file_record.
    rel_path comes in already sanitised — we only sanitise member names here.
    """
    ext     = sanitise_ext(archive_path.suffix)
    entries: list = []

    def _sleep() -> None:
        if stat_sleep_us > 0:
            time.sleep(stat_sleep_us / 1_000_000)

    try:
        if ext == ".zip":
            import zipfile
            with zipfile.ZipFile(archive_path) as zf:
                for info in zf.infolist():
                    _sleep()
                    if info.is_dir():
                        continue
                    raw_inner = sanitise_str(info.filename, MAX_PATH_LEN)
                    raw_name  = sanitise_str(Path(info.filename).name, MAX_NAME_LEN)
                    try:
                        y, mo, d = info.date_time[:3]
                        mtime = (
                            f"{y:04d}-{mo:02d}-{d:02d}"
                            if 1970 <= y <= 9999 else EPOCH_ZERO
                        )
                    except Exception:
                        mtime = EPOCH_ZERO
                    entries.append(make_file_record(
                        name=raw_name,
                        path=f"{rel_path}::{raw_inner}",
                        size=info.file_size,
                        modified=mtime,
                        ext=Path(raw_name).suffix,
                        ftype=classify(sanitise_ext(Path(raw_name).suffix)),
                        inside_archive=True,
                        archive_type="zip",
                    ))

        elif ext == ".7z":
            import py7zr  # type: ignore
            with py7zr.SevenZipFile(archive_path, mode="r") as zf:
                for info in zf.list():
                    _sleep()
                    if info.is_directory:
                        continue
                    raw_inner = sanitise_str(info.filename, MAX_PATH_LEN)
                    raw_name  = sanitise_str(Path(info.filename).name, MAX_NAME_LEN)
                    entries.append(make_file_record(
                        name=raw_name,
                        path=f"{rel_path}::{raw_inner}",
                        size=info.uncompressed or 0,
                        modified=safe_mtime(info.creationtime),
                        ext=Path(raw_name).suffix,
                        ftype=classify(sanitise_ext(Path(raw_name).suffix)),
                        inside_archive=True,
                        archive_type="7z",
                    ))

        elif ext == ".rar":
            import rarfile  # type: ignore
            with rarfile.RarFile(archive_path) as rf:
                for info in rf.infolist():
                    _sleep()
                    if info.is_dir():
                        continue
                    raw_inner = sanitise_str(info.filename, MAX_PATH_LEN)
                    raw_name  = sanitise_str(Path(info.filename).name, MAX_NAME_LEN)
                    entries.append(make_file_record(
                        name=raw_name,
                        path=f"{rel_path}::{raw_inner}",
                        size=info.file_size,
                        modified=safe_mtime(info.mtime),
                        ext=Path(raw_name).suffix,
                        ftype=classify(sanitise_ext(Path(raw_name).suffix)),
                        inside_archive=True,
                        archive_type="rar",
                    ))

        elif ext in {".tar",".tgz",".tbz2",".txz",".gz",".bz2",".xz"}:
            import tarfile
            if tarfile.is_tarfile(archive_path):
                with tarfile.open(archive_path) as tf:
                    for member in tf.getmembers():
                        _sleep()
                        if not member.isfile():
                            continue
                        raw_inner = sanitise_str(member.name, MAX_PATH_LEN)
                        raw_name  = sanitise_str(Path(member.name).name, MAX_NAME_LEN)
                        entries.append(make_file_record(
                            name=raw_name,
                            path=f"{rel_path}::{raw_inner}",
                            size=member.size,
                            modified=safe_mtime(member.mtime),
                            ext=Path(raw_name).suffix,
                            ftype=classify(sanitise_ext(Path(raw_name).suffix)),
                            inside_archive=True,
                            archive_type="tar",
                        ))

    except Exception as exc:
        err_msg  = sanitise_str(str(exc), 120)
        arc_name = sanitise_str(archive_path.name, 60)
        print(
            f"\n  {red('⚠')} Could not scan {yellow(arc_name)}: {dim(err_msg)}",
            file=sys.stderr,
        )

    return entries


# ── Pre-scan: count files ─────────────────────────────────────────────────────

def count_files(root: Path, progress: Progress) -> int:
    count = 0
    for _dp, dirnames, filenames in os.walk(root):
        dirnames[:] = [
            d for d in dirnames
            if d not in SKIP_DIRS and not d.startswith(".")
        ]
        count += len(filenames)
        progress.counting(count)
    return count


# ── Main scanner ──────────────────────────────────────────────────────────────

def scan_disk(
    label:         str,
    root:          Path,
    index_dir:     Path,
    scan_archives: bool,
    throttle:      str,
) -> None:

    profile = THROTTLE_PROFILES.get(throttle, THROTTLE_PROFILES[DEFAULT_THROTTLE])
    yield_every, yield_sleep, progress_hz, stat_sleep_us = profile

    w = term_width()

    # ── Header ────────────────────────────────────────────────────────────────
    print()
    print("  " + "─" * (w - 4))
    print(f"  {bold(cyan('ColdStash'))} {dim('disk indexer')}")
    print("  " + "─" * (w - 4))
    print(f"  {dim('Disk     :')} {bold(label)}")
    print(f"  {dim('Path     :')} {yellow(str(root))}")
    print(f"  {dim('Output   :')} {dim(str(index_dir / (label + '.json')))}")
    arc_str = green("ON  (.zip .7z .rar .tar …)") if scan_archives else dim("OFF")
    print(f"  {dim('Archives :')} {arc_str}")
    print(
        f"  {dim('Throttle :')} {cyan(throttle)}  "
        f"{dim(f'yield/{yield_every} files  sleep/{yield_sleep*1000:.0f}ms  '
               f'stat/{stat_sleep_us}µs')}"
    )
    print("  " + "─" * (w - 4))
    print()

    # ── Phase 1: count ────────────────────────────────────────────────────────
    progress    = Progress(progress_hz)
    t0_count    = time.monotonic()
    total_files = count_files(root, progress)
    clear_line()
    print(
        f"  {green('✓')} Pre-scan — {bold(f'{total_files:,}')} files  "
        f"{dim(f'({_fmt_duration(time.monotonic() - t0_count)})')}"
    )
    print()

    # ── Phase 2: scan ─────────────────────────────────────────────────────────
    progress.set_total(total_files)
    t0_scan = time.monotonic()

    files:              list = []
    total_size:         int  = 0
    archives_scanned:   int  = 0
    archive_file_count: int  = 0
    skipped:            int  = 0
    done:               int  = 0
    type_counts:        dict = {}

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [
            d for d in dirnames
            if d not in SKIP_DIRS and not d.startswith(".")
        ]

        for fname in filenames:
            full = Path(dirpath) / fname

            # Throttle: micro-sleep between stat() calls (HDD seek relief)
            if stat_sleep_us > 0:
                time.sleep(stat_sleep_us / 1_000_000)

            try:
                stat = full.stat()
            except OSError:
                skipped += 1
                done    += 1
                progress.update(done)
                continue

            # Sanitise EVERYTHING from the filesystem — trust nothing
            san_name = sanitise_str(fname, MAX_NAME_LEN)
            san_path = sanitise_path(str(full.relative_to(root)))
            san_ext  = sanitise_ext(full.suffix)
            ftype    = classify(san_ext)
            mtime    = safe_mtime(stat.st_mtime)
            size     = sanitise_size(stat.st_size)

            total_size += size
            type_counts[ftype] = type_counts.get(ftype, 0) + 1

            files.append(make_file_record(
                name=san_name, path=san_path, size=size,
                modified=mtime, ext=san_ext, ftype=ftype,
                inside_archive=False, archive_type=None,
            ))

            # Archive scanning
            if scan_archives and san_ext in ARCHIVE_EXTS:
                clear_line()
                print(f"  {_c('33','📦')} {dim(san_path[:80])}")
                inner = scan_archive(full, san_path, stat_sleep_us)
                if inner:
                    archives_scanned   += 1
                    archive_file_count += len(inner)
                    files.extend(inner)
                    print(f"     {green('→')} {len(inner):,} files inside")

            done += 1
            progress.update(done, san_path)

            # Throttle: yield to OS every N files
            if yield_sleep > 0 and done % yield_every == 0:
                time.sleep(yield_sleep)

    progress.finish()

    # ── Phase 3: write JSON ───────────────────────────────────────────────────
    # Sanitise label one final time before it enters the JSON
    san_label = sanitise_label(label)
    regular   = sum(1 for f in files if not f["inside_archive"])

    index = {
        "disk_label":         san_label,
        "disk_path":          sanitise_path(str(root)),
        "indexed_at":         now_utc_str(),
        "total_files":        regular,
        "total_size_gb":      round(total_size / (1024 ** 3), 2),
        "archives_scanned":   archives_scanned,
        "archive_file_count": archive_file_count,
        "files":              files,
    }

    index_dir.mkdir(parents=True, exist_ok=True)
    out_path = index_dir / f"{san_label}.json"

    sys.stdout.write(f"  {dim('Writing index…')} ")
    sys.stdout.flush()

    # Atomic write: write to .tmp then rename — prevents corrupt JSON on kill
    tmp_path = out_path.with_suffix(".json.tmp")
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
        tmp_path.replace(out_path)
        print(green("✓"))
    except Exception as exc:
        print(red(f"failed: {sanitise_str(str(exc), 120)}"), file=sys.stderr)
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass
        sys.exit(1)

    # ── Summary ───────────────────────────────────────────────────────────────
    total_elapsed = time.monotonic() - t0_scan
    speed_avg     = regular / total_elapsed if total_elapsed > 0 else 0

    print()
    print("  " + "─" * (w - 4))
    print(
        f"  {bold(green('Done!'))}  "
        f"{dim(_fmt_duration(total_elapsed))} elapsed  ·  "
        f"{dim(f'{speed_avg:,.0f} files/s avg')}"
    )
    print("  " + "─" * (w - 4))
    print()

    # Type breakdown
    print(f"  {'Type':<12}  {'Files':>9}  {'Share':>6}")
    print(f"  {'─'*12}  {'─'*9}  {'─'*6}")
    for ftype in ["document","photo","video","audio","archive","code","other"]:
        n = type_counts.get(ftype, 0)
        if n == 0:
            continue
        pct    = n / regular * 100 if regular else 0
        bar    = "█" * max(1, int(pct / 5))
        colorf = TYPE_COLOR.get(ftype, dim)
        print(
            f"  {colorf(f'{ftype:<12}')}  {n:>9,}  "
            f"{dim(f'{pct:5.1f}%')}  {colorf(bar)}"
        )

    print()
    print(f"  {dim('Regular files    :')} {bold(f'{regular:,}')}")
    print(f"  {dim('Total disk size  :')} {bold(_fmt_size(total_size))}")
    if scan_archives:
        print(
            f"  {dim('Archives scanned :')} {bold(f'{archives_scanned:,}')}  "
            f"{dim(f'→  {archive_file_count:,} files inside')}"
        )
    if skipped:
        print(f"  {dim('Skipped (no access):')} {yellow(f'{skipped:,}')}")
    print(f"  {dim('Index saved to   :')} {cyan(str(out_path))}")
    print()


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scan a disk and produce a ColdStash JSON index file.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("label", help="Disk label, e.g. Disk00 or ARK")
    parser.add_argument("path",  help="Drive or folder to scan, e.g. E:\\ or /mnt/disk0")
    parser.add_argument(
        "--index-dir", default=None,
        help="Directory to save the JSON index (default: ~/DiskIndexes)",
    )
    parser.add_argument(
        "--no-archives", action="store_true",
        help="Skip scanning inside archive files",
    )
    parser.add_argument(
        "--throttle",
        choices=list(THROTTLE_PROFILES.keys()),
        default=DEFAULT_THROTTLE,
        help=(
            "Resource throttle profile (default: %(default)s). "
            "high=max speed, normal=light yield, "
            "low=low-end machines, hdd=spinning drives"
        ),
    )
    parser.add_argument(
        "--no-color", action="store_true",
        help="Disable colour output (also via NO_COLOR env var)",
    )
    args = parser.parse_args()

    if args.no_color:
        global COLOR
        COLOR = False

    # Validate and sanitise label
    label = sanitise_label(args.label)
    if not label:
        print(
            f"{red('Error:')} label '{args.label}' contains only illegal characters.",
            file=sys.stderr,
        )
        sys.exit(1)

    root = Path(args.path).resolve()
    if not root.exists():
        print(f"{red('Error:')} path does not exist: {root}", file=sys.stderr)
        sys.exit(1)
    if not root.is_dir():
        print(f"{red('Error:')} path is not a directory: {root}", file=sys.stderr)
        sys.exit(1)

    # Refuse to scan known system directories
    if sys.platform == "win32":
        blocked = {Path("C:\\Windows"), Path("C:\\Windows\\System32")}
        if root in blocked:
            print(
                f"{red('Error:')} refusing to scan Windows system directory.",
                file=sys.stderr,
            )
            sys.exit(1)

    index_dir = (
        Path(args.index_dir).resolve()
        if args.index_dir
        else Path.home() / "DiskIndexes"
    )

    # Warn if index output is inside the scanned path
    try:
        index_dir.relative_to(root)
        print(
            f"  {yellow('Warning:')} index output dir is inside the scanned path — "
            f"the index file will appear in results.",
            file=sys.stderr,
        )
    except ValueError:
        pass  # index_dir is outside root — good

    scan_disk(
        label         = label,
        root          = root,
        index_dir     = index_dir,
        scan_archives = not args.no_archives,
        throttle      = args.throttle,
    )


if __name__ == "__main__":
    main()
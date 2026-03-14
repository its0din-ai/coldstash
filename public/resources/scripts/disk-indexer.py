#!/usr/bin/env python3
"""
disk-indexer.py — ColdStash disk scanner
=======================================
Scans a disk and produces a JSON index file for import into ColdStash Web.

Usage:
    python disk-indexer.py <label> <path> [options]

Examples:
    python disk-indexer.py Disk00 E:\\
    python disk-indexer.py Disk01 F:\\ --no-archives
    python disk-indexer.py Disk02 G:\\ --index-dir D:\\MyIndexes

Requirements (optional, for archive scanning):
    pip install py7zr rarfile
"""

import os
import sys
import json
import argparse
import datetime
from pathlib import Path

# ── File type classification ──────────────────────────────────────────────────

def _build_ext_map() -> dict[str, str]:
    m: dict[str, str] = {}
    for ext in [".pdf",".doc",".docx",".odt",".rtf",".txt",".md",".csv",
                ".xls",".xlsx",".ods",".ppt",".pptx",".odp",".epub",".mobi"]:
        m[ext] = "document"
    for ext in [".jpg",".jpeg",".png",".gif",".bmp",".tiff",".tif",".webp",
                ".heic",".heif",".raw",".cr2",".nef",".arw",".svg"]:
        m[ext] = "photo"
    for ext in [".mp4",".mkv",".avi",".mov",".wmv",".flv",".webm",
                ".m4v",".mpg",".mpeg",".3gp",".ts",".vob"]:
        m[ext] = "video"
    for ext in [".mp3",".flac",".wav",".aac",".ogg",".wma",".m4a",".opus",".aiff"]:
        m[ext] = "audio"
    for ext in [".zip",".7z",".rar",".tar",".gz",".bz2",".xz",
                ".tgz",".tbz2",".txz",".iso",".cab"]:
        m[ext] = "archive"
    for ext in [".py",".js",".ts",".jsx",".tsx",".java",".c",".cpp",".h",".cs",
                ".go",".rs",".rb",".php",".sh",".bat",".ps1",".sql",
                ".html",".css",".json",".xml",".yaml",".yml",".toml"]:
        m[ext] = "code"
    return m

EXT_MAP = _build_ext_map()

SKIP_DIRS = frozenset({
    "$RECYCLE.BIN", "System Volume Information", "RECYCLER",
    ".Spotlight-V100", ".Trashes", ".fseventsd", ".TemporaryItems",
    "RECYCLED",
})

ARCHIVE_EXTS = frozenset({".zip", ".7z", ".rar", ".tar", ".gz", ".bz2", ".xz",
                           ".tgz", ".tbz2", ".txz"})


def classify(ext: str) -> str:
    return EXT_MAP.get(ext.lower(), "other")


# ── Archive scanning ──────────────────────────────────────────────────────────

def scan_archive(archive_path: Path, rel_path: str) -> list[dict]:
    """Return a list of file dicts for files inside an archive."""
    ext = archive_path.suffix.lower()
    entries = []

    try:
        if ext == ".zip":
            import zipfile
            with zipfile.ZipFile(archive_path) as zf:
                for info in zf.infolist():
                    if info.is_dir():
                        continue
                    name = Path(info.filename).name
                    entries.append({
                        "name":           name,
                        "path":           f"{rel_path}::{info.filename}",
                        "size":           info.file_size,
                        "modified":       "{:04d}-{:02d}-{:02d}".format(*info.date_time[:3]),
                        "ext":            Path(name).suffix.lower(),
                        "type":           classify(Path(name).suffix),
                        "inside_archive": True,
                        "archive_type":   "zip",
                    })

        elif ext == ".7z":
            import py7zr
            with py7zr.SevenZipFile(archive_path, mode="r") as zf:
                for info in zf.list():
                    if info.is_directory:
                        continue
                    name = Path(info.filename).name
                    entries.append({
                        "name":           name,
                        "path":           f"{rel_path}::{info.filename}",
                        "size":           info.uncompressed or 0,
                        "modified":       info.creationtime.strftime("%Y-%m-%d") if info.creationtime else None,
                        "ext":            Path(name).suffix.lower(),
                        "type":           classify(Path(name).suffix),
                        "inside_archive": True,
                        "archive_type":   "7z",
                    })

        elif ext == ".rar":
            import rarfile
            with rarfile.RarFile(archive_path) as rf:
                for info in rf.infolist():
                    if info.is_dir():
                        continue
                    name = Path(info.filename).name
                    entries.append({
                        "name":           name,
                        "path":           f"{rel_path}::{info.filename}",
                        "size":           info.file_size,
                        "modified":       info.mtime.strftime("%Y-%m-%d") if info.mtime else None,
                        "ext":            Path(name).suffix.lower(),
                        "type":           classify(Path(name).suffix),
                        "inside_archive": True,
                        "archive_type":   "rar",
                    })

        elif ext in {".tar", ".tgz", ".tbz2", ".txz", ".gz", ".bz2", ".xz"}:
            import tarfile
            if tarfile.is_tarfile(archive_path):
                with tarfile.open(archive_path) as tf:
                    for member in tf.getmembers():
                        if not member.isfile():
                            continue
                        name = Path(member.name).name
                        mtime = datetime.datetime.utcfromtimestamp(member.mtime).strftime("%Y-%m-%d") if member.mtime else None
                        entries.append({
                            "name":           name,
                            "path":           f"{rel_path}::{member.name}",
                            "size":           member.size,
                            "modified":       mtime,
                            "ext":            Path(name).suffix.lower(),
                            "type":           classify(Path(name).suffix),
                            "inside_archive": True,
                            "archive_type":   "tar",
                        })

    except Exception as exc:
        print(f"  ⚠ Could not scan {archive_path.name}: {exc}", file=sys.stderr)

    return entries


# ── Main scanner ──────────────────────────────────────────────────────────────

def scan_disk(
    label: str,
    root: Path,
    index_dir: Path,
    scan_archives: bool,
) -> None:
    print(f"\nIndexing {label} at {root} ...")
    if scan_archives:
        print("  Archive scanning ON (.7z .zip .rar .tar .gz …)\n")
    else:
        print("  Archive scanning OFF\n")

    files: list[dict] = []
    total_size = 0
    archives_scanned = 0
    archive_file_count = 0

    for dirpath, dirnames, filenames in os.walk(root):
        # Prune skip dirs in-place
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]

        for fname in filenames:
            full = Path(dirpath) / fname
            try:
                stat = full.stat()
            except OSError:
                continue

            ext      = full.suffix.lower()
            rel      = str(full.relative_to(root))
            ftype    = classify(ext)
            mtime    = datetime.datetime.utcfromtimestamp(stat.st_mtime).strftime("%Y-%m-%d")
            total_size += stat.st_size

            files.append({
                "name":           fname,
                "path":           rel,
                "size":           stat.st_size,
                "modified":       mtime,
                "ext":            ext,
                "type":           ftype,
                "inside_archive": False,
                "archive_type":   None,
            })

            # Scan archive contents
            if scan_archives and ext in ARCHIVE_EXTS:
                inner = scan_archive(full, rel)
                if inner:
                    archives_scanned += 1
                    archive_file_count += len(inner)
                    files.extend(inner)
                    print(f"  📦 {rel} → {len(inner)} files")

    total_gb = round(total_size / (1024 ** 3), 2)
    regular  = sum(1 for f in files if not f["inside_archive"])

    index = {
        "disk_label":          label,
        "disk_path":           str(root),
        "indexed_at":          datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        "total_files":         regular,
        "total_size_gb":       total_gb,
        "archives_scanned":    archives_scanned,
        "archive_file_count":  archive_file_count,
        "files":               files,
    }

    index_dir.mkdir(parents=True, exist_ok=True)
    out_path = index_dir / f"{label}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\n✓ Done!")
    print(f"  Regular files     : {regular:,}")
    if scan_archives:
        print(f"  Archives scanned  : {archives_scanned:,}  →  {archive_file_count:,} files inside")
    print(f"  Total disk size   : {total_gb} GB")
    print(f"  Index saved to    : {out_path}\n")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scan a disk and produce a ColdStash JSON file.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("label", help="Disk label, e.g. Disk00")
    parser.add_argument("path",  help="Drive or folder to scan, e.g. E:\\ or /mnt/disk0")
    parser.add_argument("--index-dir", default=None,
                        help="Directory to save the JSON index (default: ~/ColdStash)")
    parser.add_argument("--no-archives", action="store_true",
                        help="Skip scanning inside archive files")
    args = parser.parse_args()

    root = Path(args.path).resolve()
    if not root.exists():
        print(f"Error: path does not exist: {root}", file=sys.stderr)
        sys.exit(1)

    if args.index_dir:
        index_dir = Path(args.index_dir)
    else:
        index_dir = Path.home() / "ColdStash"

    scan_disk(
        label         = args.label,
        root          = root,
        index_dir     = index_dir,
        scan_archives = not args.no_archives,
    )


if __name__ == "__main__":
    main()

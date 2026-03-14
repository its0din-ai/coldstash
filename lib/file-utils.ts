import React from 'react';

export const TYPE_ICON: Record<string, string> = {
  document: "📄", photo: "🖼", video: "🎬",
  audio:    "🎵", archive: "📦", code: "💻", other: "📎",
};

export const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  document: { bg: "rgba(168,216,234,0.08)", border: "rgba(168,216,234,0.2)", text: "#a8d8ea" },
  photo:    { bg: "rgba(255,179,71,0.08)",  border: "rgba(255,179,71,0.2)",  text: "#ffb347" },
  video:    { bg: "rgba(195,155,211,0.08)", border: "rgba(195,155,211,0.2)", text: "#c39bd3" },
  audio:    { bg: "rgba(126,200,164,0.08)", border: "rgba(126,200,164,0.2)", text: "#7ec8a4" },
  archive:  { bg: "rgba(244,164,96,0.08)",  border: "rgba(244,164,96,0.2)",  text: "#f4a460" },
  code:     { bg: "rgba(121,201,240,0.08)", border: "rgba(121,201,240,0.2)", text: "#79c9f0" },
  other:    { bg: "rgba(170,170,170,0.08)", border: "rgba(170,170,170,0.2)", text: "#aaa" },
};

export const ARCHIVE_BADGE: Record<string, string> = {
  zip: "ZIP", "7z": "7Z", rar: "RAR", tar: "TAR",
};

export function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1048576)     return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824)  return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function highlight(text: string, query: string): React.ReactNode {
  if (!query || query.startsWith("*.")) return text;

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escapedQuery})`, "gi"));

  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase()
      ? React.createElement('mark', { key: i }, p)
      : p
  );
}


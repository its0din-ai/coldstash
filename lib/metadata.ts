import type { Metadata } from "next";

const BASE_URL = (
  process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export const APP_NAME        = "ColdStash";
export const APP_DESCRIPTION =
  "Multi-disk offline file search. Index your external HDDs once, then find any file instantly — without plugging them in. Supports archive search inside .zip, .7z, .rar and .tar.gz.";
export const APP_KEYWORDS = [
  "offline file search",
  "external hard drive search",
  "multi-disk indexer",
  "HDD file manager",
  "archive search",
  "self-hosted file search",
  "cold storage search",
  "disk indexer",
];

export function buildMetadata(overrides: Partial<Metadata> = {}): Metadata {
  const description = overrides.description ?? APP_DESCRIPTION;

  const titleString =
    !overrides.title
      ? APP_NAME
      : typeof overrides.title === "string"
        ? overrides.title
        : (overrides.title as any).default ?? APP_NAME;

  const ogImageUrl      = `${BASE_URL}/opengraph-image.svg`;
  const xImageUrl = `${BASE_URL}/x-image.svg`;
  const logoUrl         = `${BASE_URL}/android-chrome-512x512.png`;
  const canonicalUrl    = overrides.alternates?.canonical
    ? String(overrides.alternates.canonical)
    : BASE_URL;

  const openGraph: Metadata["openGraph"] = {
    type:        "website",
    siteName:    APP_NAME,
    title:       titleString,
    description,
    url:         canonicalUrl,
    locale:      "en_US",
    images: [
      {
        url:    ogImageUrl,
        width:  1200,
        height: 630,
        alt:    `${APP_NAME} — Multi-disk offline file search`,
        type:   "image/svg+xml",
      },
    ],
    ...(overrides.openGraph ?? {}),
  };

  const twitter: Metadata["twitter"] = {
    card:        "summary_large_image",
    title:       titleString,
    description,
    images:      [xImageUrl],
    ...(overrides.twitter ?? {}),
  };

  const { openGraph: _og, twitter: _tw, other: _other, ...restOverrides } = overrides;

  const otherMeta: Record<string, string> = {
    "og:logo": logoUrl,
    ...(_other as Record<string, string> ?? {}),
  };

  return {
    metadataBase: new URL(BASE_URL),

    title: overrides.title ?? {
      default:  APP_NAME,
      template: `%s · ${APP_NAME}`,
    },
    description,
    keywords:   APP_KEYWORDS,
    authors:    [{ name: "ColdStash" }],
    creator:    "ColdStash",
    publisher:  "ColdStash",
    category:   "productivity",

    robots:
      process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true"
        ? { index: true,  follow: true  }
        : { index: false, follow: false },

    alternates: {
      canonical: canonicalUrl,
      ...(overrides.alternates ?? {}),
    },

    icons: {
      icon: [
        { url: "/favicon.ico",       sizes: "any" },
        { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
        { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      ],
      apple:   [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
      other: [
        { rel: "android-chrome-192x192", url: "/android-chrome-192x192.png" },
        { rel: "android-chrome-512x512", url: "/android-chrome-512x512.png" },
      ],
      shortcut: "/favicon.ico",
    },

    manifest:    "/site.webmanifest",
    colorScheme: "dark",
    other:       otherMeta,

    ...restOverrides,
    openGraph,
    twitter,
  };
}
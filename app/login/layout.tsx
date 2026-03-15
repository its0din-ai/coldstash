import type { Metadata } from "next";
import { buildMetadata, APP_NAME } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({
  title:       "Sign In",
  description: `${APP_NAME} — Multi-disk offline file search. Self-hosted, OWASP-hardened.`,
  // No robots override — inherit the default (noindex for private tool)
  // But OG tags are fully populated so link previews work when shared
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
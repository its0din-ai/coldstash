import type { Metadata } from "next";
import { buildMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({
  title:       "Admin",
  description: "ColdStash admin panel — user management, audit log, and search history.",
  robots:      { index: false, follow: false },
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

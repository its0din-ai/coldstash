import type { Metadata } from "next";
import { buildMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({
  title:       "Indexing Guide",
  description: "Step-by-step guide to indexing your external hard drives on Windows with ColdStash.",
  robots:      { index: false, follow: false },
});

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

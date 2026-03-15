import type { Metadata } from "next";
import { buildMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({
  title:       "Indexed Disks",
  description: "Manage and import indexed disk JSON files into ColdStash.",
  robots:      { index: false, follow: false },
});

export default function DisksLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

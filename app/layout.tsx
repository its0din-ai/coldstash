import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ColdStash",
  description: "Multi-disk offline file search engine",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full flex flex-col overflow-hidden">{children}</body>
    </html>
  );
}

"use client";
import AppShell from "@/components/layout/AppShell";
import { useRouter } from "next/navigation";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-7 h-7 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-accent text-xs font-bold shrink-0">{n}</div>
        <h2 className="font-display text-base font-bold text-ink">{title}</h2>
      </div>
      <div className="ml-10 space-y-3">{children}</div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg border border-border rounded-lg px-4 py-3 font-mono text-xs text-green whitespace-pre-wrap">
      {children}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface2 border border-border rounded-lg px-4 py-3 text-xs text-muted leading-relaxed">
      {children}
    </div>
  );
}

export default function GuidePage() {
  const router = useRouter();

  return (
    <AppShell>
      <div className="h-full overflow-y-auto px-8 py-8">
        <div className="max-w-3xl mx-auto">

          <div className="mb-12">
            <h1 className="font-display text-2xl font-extrabold text-ink mb-1">How to Index Your Disks</h1>
            <p className="mb-8 text-sm text-muted">Step-by-step guide for Windows — from raw HDD to searchable index in minutes.</p>
            <p className="text-xs text-muted">*<br/>This project was fully Vibe Coded by AI and reviewed by a human. Bugs, security issues, or unexpected behavior may still exist. Use at your own risk and validate it before relying on it.</p>
            <hr className="h-px mt-5 border-muted border-1"/>
          </div>

          <Step n={1} title="Install Python & dependencies">
            <p className="text-xs text-muted leading-relaxed">
              Download Python 3.10+ from <span className="text-blue hover:text-accent"><a href="https://python.org/">python.org</a></span>. During installation, check{" "}
              <strong className="text-ink">"Add Python to PATH"</strong>.
            </p>
            <Code>{`# Install archive scanning support (one-time setup)
pip install py7zr rarfile`}</Code>
            <div className="bg-surface2 border border-border rounded-lg px-4 py-3 text-xs">
              <p className="section-label mb-2">Archive format support</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                {[
                  [".zip",         "built-in",            "text-green"],
                  [".tar .tar.gz", "built-in",            "text-green"],
                  [".7z",          "pip install py7zr",   "text-blue"],
                  [".rar",         "pip install rarfile", "text-blue"],
                ].map(([fmt, dep, cls]) => (
                  <div key={fmt} className="flex items-center gap-2">
                    <span className="text-archive">📦</span>
                    <span className="text-ink font-mono">{fmt}</span>
                    <span className={`${cls} text-[10px] ml-auto`}>{dep}</span>
                  </div>
                ))}
              </div>
            </div>
          </Step>

          <Step n={2} title="Get the indexer script">
            <p className="text-xs text-muted leading-relaxed">
              Download <code className="hover:text-accent text-blue bg-surface2 px-1 rounded"><a href="/resources/scripts/disk-indexer.py">disk-indexer.py</a></code> to a permanent folder,
              e.g. <code className="text-blue bg-surface2 px-1 rounded">C:\ColdStash\</code>.
            </p>
            <Note>
              💡 Index <code className="text-ink">.json</code> files are saved to{" "}
              <code className="text-ink">%USERPROFILE%\ColdStash\</code> by default
              (e.g. <code className="text-ink">C:\Users\You\ColdStash\</code>).
            </Note>
          </Step>

          <Step n={3} title="Connect your disk and run the indexer">
            <p className="text-xs text-muted leading-relaxed">
              Plug your external HDD into the PC. Note the drive letter Windows assigns (e.g.{" "}
              <code className="text-ink bg-surface2 px-1 rounded">E:</code>). Open Command Prompt in the script folder:
            </p>
            <Code>{`# Basic usage — scans the whole disk including archive contents
python disk-indexer.py Disk00 E:\\

# Give each disk a unique label matching the physical label on the drive
python disk-indexer.py Disk01 F:\\
python disk-indexer.py Disk02 G:\\

# Skip archive scanning (faster, use if disk has no archives)
python disk-indexer.py Disk03 E:\\ --no-archives

# Save index to a custom folder
python disk-indexer.py Disk04 E:\\ --index-dir D:\\MyIndexes`}</Code>
            <div className="bg-surface2 border border-border rounded-lg px-4 py-3 text-xs">
              <p className="section-label mb-2">Sample output</p>
              <div className="font-mono text-[11px] space-y-0.5 text-muted">
                <div><span className="text-ink">Indexing Disk00 at E:\\ ...</span></div>
                <div>&nbsp;&nbsp;Archive scanning ON (.7z .zip .rar .tar.gz)</div>
                <div>&nbsp;&nbsp;📦 Videos\backup_2022.7z → 312 files</div>
                <div>&nbsp;&nbsp;12,450 entries indexed.</div>
                <div className="mt-2 text-green">✓ Done!</div>
                <div>&nbsp;&nbsp;Regular files     : 11,200</div>
                <div>&nbsp;&nbsp;Archives scanned  : 48  →  1,250 inside</div>
                <div>&nbsp;&nbsp;Total disk size   : 487.2 GB</div>
                <div>&nbsp;&nbsp;Index saved to    : C:\Users\You\ColdStash\Disk00.json</div>
              </div>
            </div>
          </Step>

          <Step n={4} title="Import the index into ColdStash">
            <p className="text-xs text-muted leading-relaxed">
              You <strong className="text-ink">don't need the disk connected</strong> for this step.
            </p>
            <ol className="space-y-2 text-xs text-muted">
              {[
                <>Go to the <button onClick={() => router.push("/disks")} className="text-blue hover:underline">💾 Disks</button> tab</>,
                <>Click <strong className="text-ink">⚡ Import Index</strong></>,
                <>Drag and drop your <code className="text-ink">Disk00.json</code> onto the drop zone (or click to browse)</>,
                <>Wait for upload — all file records are stored in the database</>,
                <>Repeat for each disk</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-accent shrink-0">{'①②③④⑤'[i]}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <Note>
              💡 You only need to re-import a disk when you add new files to it. Re-importing replaces the old index automatically.
            </Note>
          </Step>

          <Step n={5} title="Search">
            <p className="text-xs text-muted leading-relaxed">
              Go to <button onClick={() => router.push("/")} className="text-blue hover:underline">🔍 Search</button> and start typing.
              The disk doesn't need to be connected.
            </p>
            <div className="bg-surface2 border border-border rounded-lg px-4 py-3 text-xs">
              <p className="section-label mb-3">Search tips</p>
              <div className="space-y-2.5">
                {[
                  ["*.7z",         "Find all 7z files across every disk"],
                  ["CVE-2020", "Substring match against filename and folder path"],
                  ["IMG_",          "Prefix match — finds IMG_001.jpg, IMG_002.jpg, etc."],
                  ["report.pdf",    "Finds the file even if it's inside a .7z or .zip archive"],
                ].map(([q, desc]) => (
                  <div key={q} className="flex items-start gap-3">
                    <code className="text-blue bg-bg px-2 py-0.5 rounded shrink-0">{q}</code>
                    <span className="text-muted">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </Step>

          <div className="border-t border-border my-8" />

          {/* Re-indexing */}
          <div className="mb-6">
            <h2 className="font-display text-base font-bold text-ink mb-3">Re-indexing a disk</h2>
            <p className="text-xs text-muted leading-relaxed mb-3">
              Run the indexer again whenever you add files. Then re-import — old records are replaced automatically.
            </p>
            <Code>{`python disk-indexer.py Disk00 E:\\`}</Code>
          </div>

          {/* Naming strategy */}
          <div className="mb-6">
            <h2 className="font-display text-base font-bold text-ink mb-3">Disk labelling strategy</h2>
            <div className="bg-surface2 border border-border rounded-lg px-4 py-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-muted">
                {[
                  ["By number",  "Disk00 → DiskNN",          "Simple, sequential — good for generic backups"],
                  ["By year",    "Photos2019, Videos2022",    "If content is sorted by year"],
                  ["By content", "MoviesA, DocsBackup",       "If each disk holds specific content types"],
                ].map(([title, example, desc]) => (
                  <div key={title}>
                    <div className="text-ink font-semibold mb-1">{title}</div>
                    <code className="text-blue text-[10px]">{example}</code>
                    <p className="mt-1 text-[10px]">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Full CLI reference */}
          <div className="mb-2">
            <h2 className="font-display text-base font-bold text-ink mb-3">Full command reference</h2>
            <Code>{`python disk-indexer.py <label> <path> [options]

Options:
  --index-dir <path>    Save index JSON to a custom folder
  --no-archives         Skip scanning inside archive files`}</Code>
          </div>

        </div>
      </div>
    </AppShell>
  );
}

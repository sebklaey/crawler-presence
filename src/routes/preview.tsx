import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";

import { AppShell, PageHead } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { generatedFiles, isCoreEmpty } from "@/lib/knowledge";
import { useSessionSync } from "@/hooks/use-session-sync";
import { useCore } from "@/lib/store";
import { useFunnelOnce } from "@/lib/funnel";
import { Empty } from "./knowledge.index";

export const Route = createFileRoute("/preview")({
  head: () => ({
    meta: [
      { title: "Preview files — Crawler" },
      {
        name: "description",
        content: "Preview llms.txt, llms-full.txt, markdown pages and JSON endpoints generated from your Knowledge Core.",
      },
      { property: "og:title", content: "Preview files — Crawler" },
      { property: "og:description", content: "Every file is generated from one Knowledge Core — and only when relevant." },
    ],
  }),
  component: PreviewPage,
});

function PreviewPage() {
  useFunnelOnce("preview_opened");
  const [core] = useCore();
  useSessionSync();
  const files = generatedFiles(core);
  const [active, setActive] = useState(0);

  if (isCoreEmpty(core)) return <Empty />;

  const file = files[Math.min(active, files.length - 1)]!;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="Free preview"
          title="Generated presence"
          description="One Knowledge Core, many renderings. Files only appear when they are relevant to your entity — a photographer gets projects and a CV, a software company gets services and an FAQ."
        />
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-1">
            {files.map((f, i) => (
              <button
                key={f.path}
                onClick={() => setActive(i)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left font-mono text-xs transition-colors ${
                  i === active ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                }`}
              >
                <span>/{f.path}</span>
                <span className="opacity-60">{f.type}</span>
              </button>
            ))}
          </aside>

          <div className="min-w-0 rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="font-mono text-xs">/{file.path}</span>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void navigator.clipboard.writeText(file.content);
                    toast.success("Copied");
                  }}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const blob = new Blob([file.content], { type: "text/plain" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = file.path.replace(/\//g, "-");
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                </Button>
              </div>
            </div>
            <pre className="max-h-[65vh] overflow-auto px-4 py-4 font-mono text-[12.5px] leading-relaxed">
              {file.content}
            </pre>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

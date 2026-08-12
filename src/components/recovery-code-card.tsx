import { useState } from "react";
import { Copy, Download, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * The management secret is shown exactly once, at publish time. Crawler stores
 * only a hash of it, so this card is the only chance the user has to keep it.
 */
export function RecoveryCodeCard({ code, slug }: { code: string; slug: string }) {
  const [acknowledged, setAcknowledged] = useState(false);

  function download() {
    const body = [
      "Crawler — Presence recovery code",
      "",
      `Presence: /p/${slug}`,
      `Recovery code: ${code}`,
      "",
      "This code is the only way to manage this Presence: take it offline, put it",
      "back online, rotate the code or manage the subscription at /manage.",
      "Crawler has no accounts and stores only a hash of this code.",
      "If you lose it, the Presence cannot be recovered by anyone.",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `crawler-recovery-${slug}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setAcknowledged(true);
  }

  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-6">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShieldAlert className="h-4 w-4" />
        Your recovery code — shown once
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Crawler has no accounts and no password reset. This code <strong className="text-foreground">is</strong> your
        ownership: it lets you take the Presence offline, rotate the code and manage the subscription. We store only a
        one-way hash, so it cannot be shown again or recovered — not even by us.
      </p>

      <code className="mt-4 block break-all rounded-lg border border-border bg-secondary/60 px-3 py-3 font-mono text-sm">
        {code}
      </code>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(code);
            setAcknowledged(true);
            toast.success("Recovery code copied.");
          }}
        >
          <Copy className="mr-2 h-3.5 w-3.5" /> Copy code
        </Button>
        <Button size="sm" variant="outline" onClick={download}>
          <Download className="mr-2 h-3.5 w-3.5" /> Download as file
        </Button>
      </div>

      {acknowledged ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Saved it? Keep it somewhere safe — a password manager is ideal. Anyone holding this code controls the
          Presence.
        </p>
      ) : null}
    </div>
  );
}

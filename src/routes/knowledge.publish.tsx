import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/kc/record-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { manageUpdateCoreFn } from "@/lib/manage.functions";
import { generatedFiles, isCoreEmpty } from "@/lib/knowledge";
import { completeness, completenessScore } from "@/lib/kc/model";
import { snapshot } from "@/lib/kc/apply";
import { useCore, usePublished, useRecoveryCode, useProposals, useVersions } from "@/lib/store";

export const Route = createFileRoute("/knowledge/publish")({ component: PublishPage });

function PublishPage() {
  const [core] = useCore();
  const [published] = usePublished();
  const [code, setCode] = useRecoveryCode();
  const [proposals] = useProposals();
  const [, setVersions] = useVersions();
  const [busy, setBusy] = useState(false);
  const update = useServerFn(manageUpdateCoreFn);

  const files = isCoreEmpty(core) ? [] : generatedFiles(core);
  const rows = completeness(core);
  const score = completenessScore(core);
  const pending = proposals.filter((p) => p.state === "pending").length;

  async function publish() {
    if (!code.trim()) {
      toast.error("Enter your recovery code first.");
      return;
    }
    setBusy(true);
    try {
      const result = (await update({ data: { code: code.trim(), core } })) as {
        ok: boolean;
        reason?: string;
        paths?: string[];
        version?: number;
      };
      if (!result.ok) {
        toast.error(
          result.reason === "empty-core"
            ? "Your Knowledge Core is empty — nothing was published."
            : result.reason === "invalid-code"
              ? "That recovery code does not match a published Presence."
              : "Publishing did not work right now. Please try again.",
        );
        return;
      }
      setVersions((v) => [snapshot(core, `Published version ${result.version ?? ""}`.trim()), ...v].slice(0, 30));
      toast.success(`Published. ${result.paths?.length ?? 0} files regenerated.`);
    } catch {
      toast.error("Publishing did not work right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Card title="Ready to publish?" hint="Publication only happens after you confirm. Nothing is pushed automatically.">
          <div className="flex items-center gap-3">
            <Badge variant="outline">{score}% complete</Badge>
            {pending > 0 ? (
              <span className="text-xs text-muted-foreground">
                {pending} proposals are still open —{" "}
                <Link to="/knowledge/changes" className="underline underline-offset-4">
                  decide them first
                </Link>
                .
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">No open proposals.</span>
            )}
          </div>

          <ul className="grid gap-2 sm:grid-cols-2">
            {rows.map((r) => (
              <li key={r.section} className="flex items-center gap-2 text-sm">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${r.done ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                />
                <span className={r.done ? "" : "text-muted-foreground"}>
                  {r.label} <span className="text-xs text-muted-foreground">({r.count})</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Files that will be generated" hint="Only sections marked public are written into these files.">
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to generate yet.</p>
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {files.map((f) => (
                <li key={f.path} className="flex items-center justify-between rounded-md border border-border/70 px-3 py-1.5 text-xs">
                  <span className="font-mono">/{f.path}</span>
                  <span className="text-muted-foreground">{f.content.length.toLocaleString("en-US")} chars</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <aside className="space-y-6">
        <Card title="Publish update" hint="Your recovery code is the only key — Crawler has no accounts.">
          {published ? (
            <p className="text-xs text-muted-foreground">
              Live Presence: <span className="font-mono">/p/{published.slug}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              No Presence published from this browser yet.{" "}
              <Link to="/publish" className="underline underline-offset-4">
                Publish for the first time
              </Link>
              .
            </p>
          )}

          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="presence-xxxxxx~crw_…"
            className="font-mono text-xs"
          />

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="w-full" disabled={busy || isCoreEmpty(core)}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
                Publish current Knowledge Core
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Publish these changes?</AlertDialogTitle>
                <AlertDialogDescription>
                  All public records are written to your live Presence and every AI-readable file is regenerated.
                  Internal and private records stay in this workspace.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void publish()}>Publish</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Keep your recovery code safe. It is the only way to manage or update this Presence — Crawler cannot recover
            it for you.
          </p>
        </Card>
      </aside>
    </div>
  );
}

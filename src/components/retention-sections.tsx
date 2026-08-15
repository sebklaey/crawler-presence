/**
 * Presence health, source monitoring and the improvement workflow.
 *
 * Every number here is explained, every change needs the owner's approval, and
 * nothing claims to measure anything outside Crawler.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addSourceFn,
  decideRecommendationFn,
  removeSourceFn,
  resolveChangeFn,
  retentionOverviewFn,
  scanSourcesFn,
  type RetentionOverview,
} from "@/lib/retention.functions";

type Loaded = Extract<RetentionOverview, { ok: true }>;

const STATE_LABEL: Record<string, string> = {
  new: "New",
  activating: "Activating",
  healthy: "Healthy",
  needs_attention: "Needs attention",
  at_risk: "At risk",
  payment_risk: "Billing issue",
  dormant: "Dormant",
};

export function RetentionSection() {
  const [data, setData] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function load() {
    setBusy(true);
    try {
      const result = await retentionOverviewFn();
      if (!result.ok) {
        toast.error("Could not load the health check right now.");
        return;
      }
      setData(result);
    } finally {
      setBusy(false);
    }
  }

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    try {
      await fn();
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-sm font-medium">Presence health &amp; improvements</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          An explainable 0–100 score of what Crawler can measure about your published Presence, monitoring of the
          source URLs you approve, and one clear recommended action at a time. It is not a ranking in any AI assistant.
        </p>
        <Button className="mt-4" variant="outline" disabled={busy} onClick={() => void load()}>
          {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          Run health check
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">Presence health</h2>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {STATE_LABEL[data.health.state] ?? data.health.state}
          </span>
        </div>
        <div className="display mt-3 text-4xl">{data.health.score}/100</div>
        <p className="mt-2 text-xs text-muted-foreground">{data.explanation}</p>
        <ul className="mt-5 space-y-2 text-sm">
          {data.health.reasons.map((reason) => (
            <li key={reason.key} className="flex justify-between gap-4 border-t border-border pt-2">
              <span>
                {reason.label}
                <span className="block text-[11px] text-muted-foreground">{reason.detail}</span>
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {reason.points}/{reason.max}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-sm font-medium">Monitored sources</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Crawler reads only public URLs you approve here, {data.scanFrequency} on your plan, and tells you when they
          change. Your published Presence is never edited automatically. Up to {data.sourceLimit} source
          {data.sourceLimit === 1 ? "" : "s"}.
        </p>

        <ul className="mt-4 space-y-2 text-sm">
          {data.sources.map((source) => (
            <li key={source.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
              <span className="break-all">
                {source.url}
                <span className="block text-[11px] text-muted-foreground">
                  {source.lastScannedAt
                    ? `Last read ${new Date(source.lastScannedAt).toLocaleDateString()} · ${source.lastStatus ?? "ok"}`
                    : "Not read yet"}
                  {source.lastError ? ` · ${source.lastError}` : ""}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void run(() => removeSourceFn({ data: { id: source.id } }))}
              >
                Remove
              </Button>
            </li>
          ))}
          {data.sources.length === 0 ? <li className="text-xs text-muted-foreground">No source approved yet.</li> : null}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://your-site.example/about"
            className="max-w-sm"
          />
          <Button
            variant="outline"
            disabled={busy || url.trim().length < 4}
            onClick={() =>
              void run(async () => {
                const result = await addSourceFn({ data: { url: url.trim() } });
                if (!result.ok) toast.error("message" in result ? result.message : "That URL could not be added.");
                else setUrl("");
              })
            }
          >
            Approve source
          </Button>
          <Button
            variant="ghost"
            disabled={busy || data.sources.length === 0}
            onClick={() =>
              void run(async () => {
                const result = await scanSourcesFn();
                if (result.ok) toast.success(`Scanned ${result.scanned} source(s), ${result.changed} changed.`);
              })
            }
          >
            Scan now
          </Button>
        </div>
      </div>

      {data.changes.length ? (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-sm font-medium">Detected changes</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {data.changes.map((change) => (
              <li key={change.id} className="border-t border-border pt-3">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {change.classification.replace(/_/g, " ")}
                </div>
                <p className="mt-1">{change.summary}</p>
                {change.evidence ? (
                  <p className="mt-1 border-l border-border pl-3 text-xs text-muted-foreground">{change.evidence}</p>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void run(() => resolveChangeFn({ data: { id: change.id, status: "reviewed" } }))}
                  >
                    Mark reviewed
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void run(() => resolveChangeFn({ data: { id: change.id, status: "dismissed" } }))}
                  >
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-sm font-medium">Recommended improvements</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Each item states what Crawler observed, why it matters and which files it affects. Nothing is published until
          you approve the exact wording.
        </p>
        {data.recommendations.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Nothing to improve right now.</p>
        ) : (
          <ul className="mt-4 space-y-4 text-sm">
            {data.recommendations.map((rec) => (
              <li key={rec.id} className="border-t border-border pt-3">
                <p className="font-medium">{rec.issue}</p>
                {rec.evidence ? <p className="mt-1 text-xs text-muted-foreground">{rec.evidence}</p> : null}
                <p className="mt-1 text-xs text-muted-foreground">Why it matters: {rec.expectedBenefit}</p>
                {rec.affectedFiles.length ? (
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">{rec.affectedFiles.join(" · ")}</p>
                ) : null}

                {editing === rec.id ? (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      rows={4}
                      placeholder="The exact text to publish"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy || draft.trim().length < 3}
                        onClick={() =>
                          void run(async () => {
                            const result = await decideRecommendationFn({
                              data: { id: rec.id, decision: "approve", value: draft.trim() },
                            });
                            if (!result.ok) toast.error("message" in result ? result.message : "Publishing failed.");
                            else {
                              toast.success("Published — your public files were regenerated.");
                              setEditing(null);
                              setDraft("");
                            }
                          })
                        }
                      >
                        Approve &amp; publish
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {rec.fieldPath === "summary" || rec.fieldPath === "tagline" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setEditing(rec.id);
                          setDraft(rec.proposedValue ?? rec.currentValue ?? "");
                        }}
                      >
                        Write &amp; publish
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void run(() => decideRecommendationFn({ data: { id: rec.id, decision: "postpone" } }))}
                    >
                      Later
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void run(() => decideRecommendationFn({ data: { id: rec.id, decision: "reject" } }))}
                    >
                      Not relevant
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { ProposalCard } from "@/components/kc/proposal-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { applyProposal, currentValueFor, snapshot } from "@/lib/kc/apply";
import { kcAssistantFn, type KcAssistantResult } from "@/lib/kc/assistant.functions";
import {
  EVIDENCE_STATUSES,
  SECTION_KEYS,
  VISIBILITIES,
  completeness,
  kcId,
  sectionLabel,
  type EvidenceStatus,
  type Proposal,
  type SectionKey,
  type Visibility,
} from "@/lib/kc/model";
import { useCore, useKcChat, useProposals, useVersions, uid } from "@/lib/store";

export const Route = createFileRoute("/knowledge/assistant")({ component: AssistantPage });

const STARTERS = [
  "Here is what changed in the last months …",
  "Please check my summary and make it more precise.",
  "What information is missing so AI systems can answer questions about me?",
  "Remove everything that is no longer true.",
];

function AssistantPage() {
  const [core, setCore] = useCore();
  const [chat, setChat] = useKcChat();
  const [proposals, setProposals] = useProposals();
  const [, setVersions] = useVersions();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = useServerFn(kcAssistantFn);

  const pending = proposals.filter((p) => p.state === "pending");
  const gaps = completeness(core).filter((r) => !r.done);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    const history = [...chat, { id: uid(), role: "user" as const, content: message }];
    setChat(history);
    setBusy(true);
    try {
      const result = (await ask({
        data: {
          core,
          messages: history.slice(-16).map((m) => ({ role: m.role, content: m.content })),
        },
      })) as KcAssistantResult;

      if (!result.ok) {
        toast.error(result.reason);
        setBusy(false);
        return;
      }

      const reply = [result.reply, result.question].filter(Boolean).join("\n\n");
      setChat([...history, { id: uid(), role: "assistant", content: reply || "Understood." }]);

      const drafts: Proposal[] = result.proposals.map((d) => {
        const section = (SECTION_KEYS as readonly string[]).includes(d.section)
          ? (d.section as SectionKey)
          : "facts";
        const status = (EVIDENCE_STATUSES as readonly string[]).includes(d.evidence_status)
          ? (d.evidence_status as EvidenceStatus)
          : "unchecked";
        const visibility = (VISIBILITIES as readonly string[]).includes(d.visibility)
          ? (d.visibility as Visibility)
          : "public";
        return {
          id: kcId(),
          createdAt: new Date().toISOString(),
          action: d.action === "delete" ? "archive" : d.action,
          section,
          ...(d.target ? { target: d.target } : {}),
          label: d.label || sectionLabel[section],
          currentValue: d.target ? currentValueFor(core, section, d.target) : "",
          proposedValue: d.proposed_value,
          reason: d.reason ?? "",
          status,
          visibility,
          confidence: d.confidence ?? "medium",
          ...(d.source ? { source: d.source } : {}),
          warnings: Array.isArray(d.warnings) ? d.warnings : [],
          state: "pending" as const,
        };
      });

      if (drafts.length) setProposals([...drafts, ...proposals]);
    } catch {
      toast.error("The editor assistant is not reachable right now.");
    } finally {
      setBusy(false);
    }
  }

  function accept(p: Proposal) {
    setVersions((v) => [snapshot(core, `Before: ${p.label}`), ...v].slice(0, 30));
    setCore(applyProposal(core, p));
    setProposals(proposals.map((x) => (x.id === p.id ? { ...x, state: "accepted", decidedAt: new Date().toISOString() } : x)));
    toast.success("Applied to your draft. Publishing stays a separate step.");
  }

  function reject(p: Proposal) {
    setProposals(proposals.map((x) => (x.id === p.id ? { ...x, state: "rejected", decidedAt: new Date().toISOString() } : x)));
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Chat */}
        <section className="flex min-h-[520px] flex-col rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3 text-sm font-medium">
            Update with ChatGPT
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              proposals only — nothing is published automatically
            </span>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {chat.length === 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Tell the assistant what changed, what is wrong, or what should be removed. It reads your current
                  Knowledge Core and proposes structured changes you confirm one by one.
                </p>
                <div className="flex flex-wrap gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => void send(s)}
                      className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chat.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      m.role === "user" ? "bg-foreground text-background" : "bg-secondary"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))
            )}
            {busy ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading your Knowledge Core …
              </div>
            ) : null}
          </div>

          <div className="border-t border-border p-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="What changed? What should be added, corrected or removed?"
              className="min-h-20"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(input);
              }}
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">⌘/Ctrl + Enter to send</span>
              <div className="flex gap-2">
                {chat.length ? (
                  <Button size="sm" variant="ghost" onClick={() => setChat([])}>
                    Clear chat
                  </Button>
                ) : null}
                <Button size="sm" disabled={busy || !input.trim()} onClick={() => void send(input)}>
                  <Send className="mr-1.5 h-3.5 w-3.5" /> Send
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Core snapshot */}
        <aside className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="text-sm font-medium">Current Knowledge Core</div>
          <dl className="space-y-2 text-sm">
            <Row label="Name" value={core.name || "—"} />
            <Row label="Tagline" value={core.tagline || "—"} />
            <Row label="Facts" value={String(core.facts.length)} />
            <Row label="Content records" value={String(core.items.length)} />
            <Row label="FAQ" value={String(core.faqs.length)} />
          </dl>
          <p className="text-sm leading-relaxed text-muted-foreground">{core.summary || "No summary yet."}</p>
          {gaps.length ? (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Open gaps</div>
              <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                {gaps.slice(0, 6).map((g) => (
                  <li key={g.section}>· {g.label}: {g.hint}</li>
                ))}
              </ul>
            </div>
          ) : (
            <Badge variant="outline">All sections filled</Badge>
          )}
        </aside>
      </div>

      {/* Proposals */}
      <section>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <h2 className="text-sm font-medium">Proposed changes</h2>
          <span className="text-xs text-muted-foreground">{pending.length} waiting for your decision</span>
        </div>
        <div className="mt-4 grid gap-4">
          {pending.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              No open proposals. Everything the assistant suggests appears here first — green means new, blue means
              changed, red means removed.
            </p>
          ) : (
            pending.map((p) => (
              <ProposalCard key={p.id} proposal={p} onAccept={() => accept(p)} onReject={() => reject(p)} />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-right">{value}</dd>
    </div>
  );
}

import { Check, X, AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { proposalDiff } from "@/lib/kc/apply";
import { evidenceLabel, sectionLabel, visibilityLabel, type Proposal } from "@/lib/kc/model";

const diffStyle: Record<string, string> = {
  add: "border-emerald-500/40 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300",
  update: "border-sky-500/40 bg-sky-500/5 text-sky-800 dark:text-sky-300",
  remove: "border-red-500/40 bg-red-500/5 text-red-800 line-through dark:text-red-300",
  same: "border-border bg-secondary/40",
};

const diffPrefix: Record<string, string> = { add: "+", update: "~", remove: "−", same: " " };

export function DiffBlock({ proposal }: { proposal: Proposal }) {
  return (
    <div className="space-y-1.5">
      {proposalDiff(proposal).map((line, i) => (
        <div
          key={i}
          className={`rounded-lg border px-3 py-2 text-sm leading-relaxed ${diffStyle[line.kind]}`}
        >
          <span className="mr-2 select-none opacity-60">{diffPrefix[line.kind]}</span>
          {line.text}
        </div>
      ))}
    </div>
  );
}

export function ProposalCard({
  proposal,
  onAccept,
  onReject,
}: {
  proposal: Proposal;
  onAccept?: () => void;
  onReject?: () => void;
}) {
  const decided = proposal.state !== "pending";
  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="uppercase tracking-wide">
          {proposal.action}
        </Badge>
        <span className="text-sm font-medium">{sectionLabel[proposal.section] ?? proposal.section}</span>
        <span className="text-sm text-muted-foreground">· {proposal.label}</span>
        <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Badge variant="secondary">{evidenceLabel[proposal.status] ?? proposal.status}</Badge>
          <Badge variant="secondary">{proposal.confidence} confidence</Badge>
        </div>
      </div>

      <div className="mt-4">
        <DiffBlock proposal={proposal} />
      </div>

      {proposal.reason ? <p className="mt-3 text-sm text-muted-foreground">{proposal.reason}</p> : null}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>{visibilityLabel[proposal.visibility]}</span>
        {proposal.source ? <span>Source: {proposal.source}</span> : null}
        <span>Proposed {new Date(proposal.createdAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</span>
      </div>

      {proposal.warnings.length ? (
        <ul className="mt-3 space-y-1">
          {proposal.warnings.map((w, i) => (
            <li key={i} className="flex gap-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        {decided ? (
          <Badge variant={proposal.state === "accepted" ? "default" : "outline"}>
            {proposal.state === "accepted" ? "Applied to draft" : "Rejected"}
          </Badge>
        ) : (
          <>
            <Button size="sm" onClick={onAccept}>
              <Check className="mr-1.5 h-3.5 w-3.5" /> Accept into draft
            </Button>
            <Button size="sm" variant="ghost" onClick={onReject}>
              <X className="mr-1.5 h-3.5 w-3.5" /> Reject
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

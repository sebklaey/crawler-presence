import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { ProposalCard } from "@/components/kc/proposal-card";
import { Button } from "@/components/ui/button";
import { applyProposal, snapshot } from "@/lib/kc/apply";
import type { Proposal } from "@/lib/kc/model";
import { useCore, useProposals, useVersions } from "@/lib/store";

export const Route = createFileRoute("/knowledge/changes")({ component: ChangesPage });

function ChangesPage() {
  const [core, setCore] = useCore();
  const [proposals, setProposals] = useProposals();
  const [, setVersions] = useVersions();

  const pending = proposals.filter((p) => p.state === "pending");
  const decided = proposals.filter((p) => p.state !== "pending").slice(0, 40);

  function decide(p: Proposal, accept: boolean) {
    if (accept) {
      setVersions((v) => [snapshot(core, `Before: ${p.label}`), ...v].slice(0, 30));
      setCore(applyProposal(core, p));
    }
    setProposals(
      proposals.map((x) =>
        x.id === p.id ? { ...x, state: accept ? "accepted" : "rejected", decidedAt: new Date().toISOString() } : x,
      ),
    );
  }

  function acceptAll() {
    if (!pending.length) return;
    setVersions((v) => [snapshot(core, `Before accepting ${pending.length} changes`), ...v].slice(0, 30));
    let next = core;
    for (const p of [...pending].reverse()) next = applyProposal(next, p);
    setCore(next);
    const at = new Date().toISOString();
    setProposals(proposals.map((x) => (x.state === "pending" ? { ...x, state: "accepted", decidedAt: at } : x)));
    toast.success(`${pending.length} changes applied to your draft.`);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">Open proposals</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Green = new, blue = changed, red = removed. Nothing goes live until you publish.
            </p>
          </div>
          <div className="flex gap-2">
            {pending.length ? (
              <>
                <Button size="sm" variant="outline" onClick={acceptAll}>
                  Accept all ({pending.length})
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const at = new Date().toISOString();
                    setProposals(proposals.map((x) => (x.state === "pending" ? { ...x, state: "rejected", decidedAt: at } : x)));
                  }}
                >
                  Reject all
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-4">
        {pending.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground">
            No open proposals.{" "}
            <Link to="/knowledge/assistant" className="underline underline-offset-4">
              Work on your Knowledge Core with ChatGPT
            </Link>{" "}
            to get suggestions.
          </p>
        ) : (
          pending.map((p) => (
            <ProposalCard key={p.id} proposal={p} onAccept={() => decide(p, true)} onReject={() => decide(p, false)} />
          ))
        )}
      </div>

      {decided.length ? (
        <section>
          <h2 className="text-sm font-medium">Decided</h2>
          <div className="mt-4 grid gap-4">
            {decided.map((p) => (
              <ProposalCard key={p.id} proposal={p} />
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-4"
            onClick={() => setProposals(proposals.filter((p) => p.state === "pending"))}
          >
            Clear decided history
          </Button>
        </section>
      ) : null}
    </div>
  );
}

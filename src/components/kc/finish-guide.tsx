import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { completeness, completenessScore } from "@/lib/kc/model";
import type { KnowledgeCore } from "@/lib/knowledge";

/** Guided walkthrough of the sections that are still missing for 100% completeness. */
export function FinishGuide({ core }: { core: KnowledgeCore }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const rows = useMemo(() => completeness(core), [core]);
  const missing = rows.filter((r) => !r.done);
  const score = completenessScore(core);
  const current = missing[Math.min(step, Math.max(missing.length - 1, 0))];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setStep(0);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant={score === 100 ? "outline" : "default"} className="h-7 px-3 text-xs">
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          Finish
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Finish your Knowledge Core</DialogTitle>
          <DialogDescription>
            {missing.length === 0
              ? "Everything is covered — your Knowledge Core is 100% complete."
              : `${missing.length} ${missing.length === 1 ? "section is" : "sections are"} still missing. Work through them one by one to reach 100%.`}
          </DialogDescription>
        </DialogHeader>

        {missing.length === 0 || !current ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-4 text-sm">
            <Check className="h-4 w-4" />
            Nothing left to do. You can publish your Presence.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Step {Math.min(step + 1, missing.length)} of {missing.length}
              </div>
              <div className="mt-1 text-sm font-medium">{current.label}</div>
              <p className="mt-1 text-sm text-muted-foreground">{current.hint}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Currently captured: {current.count} {current.count === 1 ? "entry" : "entries"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" onClick={() => setOpen(false)}>
                <Link to="/knowledge/data">Edit data</Link>
              </Button>
              <Button asChild size="sm" variant="outline" onClick={() => setOpen(false)}>
                <Link to="/knowledge/assistant">Ask ChatGPT for help</Link>
              </Button>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <Button
                size="sm"
                variant="ghost"
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
              </Button>
              <div className="text-xs text-muted-foreground">{score}% complete</div>
              <Button
                size="sm"
                variant="ghost"
                disabled={step >= missing.length - 1}
                onClick={() => setStep((s) => Math.min(missing.length - 1, s + 1))}
              >
                Next <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

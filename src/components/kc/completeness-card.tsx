import { Check, Minus } from "lucide-react";

import { FinishGuide } from "@/components/kc/finish-guide";
import { completeness, completenessScore } from "@/lib/kc/model";
import type { KnowledgeCore } from "@/lib/knowledge";

/** Knowledge Core completeness, identical to the score shown in /knowledge. */
export function CompletenessCard({ core, columns = 1 }: { core: KnowledgeCore; columns?: 1 | 2 }) {
  const score = completenessScore(core);
  const rows = completeness(core);
  const open = rows.filter((r) => !r.done);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Knowledge Core</div>
          <div className="display mt-1 text-2xl">
            {open.length === 0 ? "Complete" : `${open.length} open ${open.length === 1 ? "point" : "points"}`}
          </div>
        </div>
        <div className="display text-4xl tabular-nums">{score}%</div>
      </div>

      <div className="mt-4 h-px w-full bg-border">
        <div className="h-px bg-foreground transition-all duration-700" style={{ width: `${score}%` }} />
      </div>

      <ul className={`mt-5 grid gap-2 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
        {rows.map((r) => (
          <li key={r.section} className="flex items-start gap-2 text-sm">
            {r.done ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
            ) : (
              <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className={r.done ? "" : "text-muted-foreground"}>{r.label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <FinishGuide core={core} />
      </div>
    </div>
  );
}

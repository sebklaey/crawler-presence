import { Link } from "@tanstack/react-router";
import { Check, Minus } from "lucide-react";

import { presenceChecks, presenceLabel, presenceScore, type KnowledgeCore } from "@/lib/knowledge";

export function PresenceStatus({
  core,
  compact = false,
  columns = 2,
}: {
  core: KnowledgeCore;
  compact?: boolean;
  columns?: 1 | 2;
}) {
  const score = presenceScore(core);
  const checks = presenceChecks(core);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Presence status</div>
          <div className="display mt-1 text-2xl">{presenceLabel(score)}</div>
        </div>
        <div className="display text-4xl tabular-nums">{score}%</div>
      </div>

      <div className="mt-4 h-px w-full bg-border">
        <div className="h-px bg-foreground transition-all duration-700" style={{ width: `${score}%` }} />
      </div>

      {!compact ? (
        <ul className={`mt-5 grid gap-2 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2 text-sm">
              {c.done ? (
                <Check className="h-3.5 w-3.5 text-foreground" />
              ) : (
                <Minus className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className={c.done ? "" : "text-muted-foreground"}>{c.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2 text-sm">
        <Link
          to="/preview"
          className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground transition-opacity hover:opacity-90"
        >
          Preview files
        </Link>
        <Link to="/knowledge" className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">
          Knowledge Core
        </Link>
        <Link to="/publish" className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">
          Publish
        </Link>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Card } from "@/components/kc/record-editor";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  EVIDENCE_STATUSES,
  evidenceLabel,
  getExt,
  visibilityLabel,
  withExt,
  type EvidenceStatus,
} from "@/lib/kc/model";
import { useCore } from "@/lib/store";

export const Route = createFileRoute("/knowledge/sources")({ component: SourcesPage });

type Row = {
  key: string;
  section: string;
  label: string;
  value: string;
  status: EvidenceStatus;
  visibility: string;
  source: string;
  onSource?: (v: string) => void;
};

function SourcesPage() {
  const [core, setCore] = useCore();
  const ext = getExt(core);
  const [filter, setFilter] = useState<"all" | EvidenceStatus>("all");

  const rows: Row[] = [
    ...core.facts.map((f) => {
      const meta = ext.evidence[f.id];
      return {
        key: `fact-${f.id}`,
        section: "Facts",
        label: f.label,
        value: f.value,
        status: (meta?.status ?? (f.status === "verified" ? "verified_fact" : "unchecked")) as EvidenceStatus,
        visibility: meta?.visibility ?? "public",
        source: f.source ?? "",
        onSource: (v: string) =>
          setCore({ ...core, facts: core.facts.map((x) => (x.id === f.id ? { ...x, source: v } : x)) }),
      };
    }),
    ...core.stories.map((s) => ({
      key: `story-${s.id}`,
      section: "Positioning",
      label: s.label,
      value: s.text,
      status: (s.confirmed ? "marketing_claim" : "unchecked") as EvidenceStatus,
      visibility: "public",
      source: "",
    })),
    ...(["audiences", "pricing", "news"] as const).flatMap((k) =>
      ext[k].map((r) => ({
        key: `${k}-${r.id}`,
        section: k === "news" ? "News & updates" : k[0]!.toUpperCase() + k.slice(1),
        label: r.title,
        value: r.body ?? "",
        status: r.status,
        visibility: r.visibility,
        source: r.source ?? "",
        onSource: (v: string) =>
          setCore(withExt(core, { ...ext, [k]: ext[k].map((x) => (x.id === r.id ? { ...x, source: v } : x)) })),
      })),
    ),
  ];

  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const documents = core.documents ?? [];

  return (
    <div className="space-y-6">
      <Card title="Evidence and sources" hint="Every statement carries an evidence level. Assistants weigh them differently.">
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...EVIDENCE_STATUSES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s as "all" | EvidenceStatus)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                filter === s ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              {s === "all" ? `All (${rows.length})` : `${evidenceLabel[s as EvidenceStatus]} (${rows.filter((r) => r.status === s).length})`}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing in this category.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Section</th>
                  <th className="py-2 pr-4">Statement</th>
                  <th className="py-2 pr-4">Evidence</th>
                  <th className="py-2 pr-4">Visibility</th>
                  <th className="py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.key} className="border-b border-border/60 align-top">
                    <td className="py-3 pr-4 text-xs text-muted-foreground">{r.section}</td>
                    <td className="max-w-sm py-3 pr-4">
                      <div className="font-medium">{r.label || "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.value}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant="outline">{evidenceLabel[r.status]}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">
                      {visibilityLabel[r.visibility as keyof typeof visibilityLabel] ?? r.visibility}
                    </td>
                    <td className="py-3">
                      {r.onSource ? (
                        <Input
                          className="h-8 w-48"
                          value={r.source}
                          placeholder="URL or document"
                          onChange={(e) => r.onSource!(e.target.value)}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Card title="Imported documents" hint="Text documents you imported into the Knowledge Core.">
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents imported.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {documents.map((d) => (
              <li key={d.title} className="rounded-xl border border-border/70 p-4">
                <div className="font-medium">{d.title}</div>
                <div className="text-xs text-muted-foreground">
                  {d.source ? `${d.source} · ` : ""}
                  {d.text.length.toLocaleString("en-US")} characters
                  {d.addedAt ? ` · added ${new Date(d.addedAt).toISOString().slice(0, 10)}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

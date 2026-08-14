import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Archive, Plus, Save, Trash2 } from "lucide-react";

import { toast } from "sonner";

import { Card, Field, RecordSection, SelectField } from "@/components/kc/record-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { archiveRecord, snapshot } from "@/lib/kc/apply";
import {
  EVIDENCE_STATUSES,
  ORGANIZATION_FIELDS,
  VISIBILITIES,
  evidenceLabel,
  getExt,
  kcId,
  visibilityLabel,
  withExt,
  type EvidenceStatus,
  type ExtRecord,
  type SectionKey,
  type Visibility,
} from "@/lib/kc/model";
import { usePlanLimits } from "@/lib/plan-limits";
import { useCore, useVersions } from "@/lib/store";
import type { KnowledgeCore } from "@/lib/knowledge";

export const Route = createFileRoute("/knowledge/data")({ component: DataPage });

const ENTITY_TYPES = ["person", "creator", "studio", "organization", "company", "project", "unknown"] as const;
const entityLabels: Record<string, string> = {
  person: "Person",
  creator: "Creator",
  studio: "Studio",
  organization: "Organization",
  company: "Company",
  project: "Project",
  unknown: "Not yet identified",
};

function DataPage() {
  const [saved, commit] = useCore();
  const [draft, setDraft] = useState<KnowledgeCore>(saved);
  const [dirty, setDirty] = useState(false);
  const [, setVersions] = useVersions();
  const { guard } = usePlanLimits();

  useEffect(() => {
    if (!dirty) setDraft(saved);
  }, [saved, dirty]);

  const core = draft;
  const setCore = (next: KnowledgeCore) => {
    setDraft(next);
    setDirty(true);
  };
  const ext = getExt(core);

  const patch = (part: Partial<KnowledgeCore>) => setCore({ ...core, ...part, updatedAt: new Date().toISOString() });

  function save() {
    setVersions((v) => [snapshot(saved, "Before saving edits"), ...v].slice(0, 30));
    commit({ ...draft, updatedAt: new Date().toISOString() });
    setDirty(false);
    toast.success("Saved to your Knowledge Core. Publishing stays a separate step.");
  }

  function discard() {
    setDraft(saved);
    setDirty(false);
    toast.message("Changes discarded.");
  }

  function archive(section: SectionKey, id: string) {
    setCore(archiveRecord(core, section, id));
    toast.success("Moved to the archive. Save to keep this change.");
  }

  const setExtList = (key: "audiences" | "pricing" | "news") => (next: ExtRecord[]) =>
    setCore(withExt(core, { ...ext, [key]: next }));

  return (
    <div className="space-y-6">
      <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 backdrop-blur">
        <p className="text-xs text-muted-foreground">
          {dirty ? "Unsaved changes in this draft." : "All changes saved."}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={discard} disabled={!dirty}>
            Discard
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty}>
            <Save className="mr-1.5 h-3.5 w-3.5" /> Save changes
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">

      <div className="space-y-6">
        <Card title="Identity" hint="The basics every AI system needs first.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" value={core.name} onChange={(v) => patch({ name: v })} />
            <SelectField
              label="Entity type"
              value={core.entityType}
              options={ENTITY_TYPES}
              labels={entityLabels}
              onChange={(v) => patch({ entityType: v })}
            />
          </div>
          <Field label="Tagline" value={core.tagline} onChange={(v) => patch({ tagline: v })} />
          <Field label="Summary" value={core.summary} multiline onChange={(v) => patch({ summary: v })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Location" value={core.location ?? ""} onChange={(v) => patch({ location: v })} />
            <Field label="Website" value={core.website ?? ""} onChange={(v) => patch({ website: v })} />
          </div>
          <Field
            label="Languages (comma separated)"
            value={(core.languages ?? []).join(", ")}
            onChange={(v) => patch({ languages: v.split(",").map((s) => s.trim()).filter(Boolean) })}
          />
        </Card>

        <Card title="Organization" hint="Only fill in what is true and checkable.">
          <div className="grid gap-4 sm:grid-cols-2">
            {ORGANIZATION_FIELDS.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                value={(ext.organization[f.key] ?? "") as string}
                onChange={(v) => setCore(withExt(core, { ...ext, organization: { ...ext.organization, [f.key]: v } }))}
              />
            ))}
          </div>
        </Card>

        <Card
          title="Facts"
          hint="Verified facts are what you confirmed. Evidence status tells assistants how much weight a statement carries."
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => patch({ facts: [...core.facts, { id: kcId(), label: "", value: "", status: "claimed" }] })}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
            </Button>
          }
        >
          {core.facts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No facts captured yet.</p>
          ) : (
            core.facts.map((f) => {
              const meta = ext.evidence[f.id];
              return (
                <div key={f.id} className="rounded-xl border border-border/70 p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Label"
                      value={f.label}
                      onChange={(v) => patch({ facts: core.facts.map((x) => (x.id === f.id ? { ...x, label: v } : x)) })}
                    />
                    <Field
                      label="Source (optional)"
                      value={f.source ?? ""}
                      onChange={(v) => patch({ facts: core.facts.map((x) => (x.id === f.id ? { ...x, source: v } : x)) })}
                    />
                  </div>
                  <div className="mt-4">
                    <Field
                      label="Value"
                      value={f.value}
                      multiline
                      onChange={(v) => patch({ facts: core.facts.map((x) => (x.id === f.id ? { ...x, value: v } : x)) })}
                    />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <SelectField
                      label="Evidence"
                      value={(meta?.status ?? (f.status === "verified" ? "verified_fact" : "unchecked")) as EvidenceStatus}
                      options={EVIDENCE_STATUSES}
                      labels={evidenceLabel}
                      onChange={(v) =>
                        setCore(
                          withExt(
                            {
                              ...core,
                              facts: core.facts.map((x) =>
                                x.id === f.id
                                  ? { ...x, status: v === "verified_fact" || v === "provider_statement" ? "verified" : "claimed" }
                                  : x,
                              ),
                            },
                            { ...ext, evidence: { ...ext.evidence, [f.id]: { status: v, visibility: meta?.visibility ?? "public" } } },
                          ),
                        )
                      }
                    />
                    <SelectField
                      label="Visibility"
                      value={(meta?.visibility ?? "public") as Visibility}
                      options={VISIBILITIES}
                      labels={visibilityLabel}
                      onChange={(v) =>
                        setCore(
                          withExt(core, {
                            ...ext,
                            evidence: {
                              ...ext.evidence,
                              [f.id]: { status: meta?.status ?? (f.status === "verified" ? "verified_fact" : "unchecked"), visibility: v },
                            },
                          }),
                        )
                      }
                    />
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <Badge variant={f.status === "verified" ? "default" : "outline"}>
                      {f.status === "verified" ? "Confirmed" : "Unconfirmed"}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => archive("facts", f.id)}>
                      <Archive className="mr-1.5 h-3.5 w-3.5" /> Archive
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </Card>
      </div>

      <div className="space-y-6">
        <Card
          title="Content records"
          hint="Offerings, projects and services — the digital things you want assistants to name."
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!guard({ limit: "content_records", count: core.items.length + 1, action: "Adding a content record" })) return;
                patch({ items: [...core.items, { id: kcId(), kind: "offering", name: "", summary: "" }] });
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
            </Button>
          }
        >
          {core.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            core.items.map((i) => (
              <div key={i.id} className="rounded-xl border border-border/70 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Name"
                    value={i.name}
                    onChange={(v) => patch({ items: core.items.map((x) => (x.id === i.id ? { ...x, name: v } : x)) })}
                  />
                  <SelectField
                    label="Type"
                    value={i.kind}
                    options={["offering", "project", "service"] as const}
                    labels={{ offering: "Offering", project: "Project", service: "Service" }}
                    onChange={(v) => patch({ items: core.items.map((x) => (x.id === i.id ? { ...x, kind: v } : x)) })}
                  />
                </div>
                <div className="mt-4">
                  <Field
                    label="Summary"
                    value={i.summary}
                    multiline
                    onChange={(v) => patch({ items: core.items.map((x) => (x.id === i.id ? { ...x, summary: v } : x)) })}
                  />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Link (optional)"
                    value={i.url ?? ""}
                    onChange={(v) => patch({ items: core.items.map((x) => (x.id === i.id ? { ...x, url: v } : x)) })}
                  />
                  <Field
                    label="Tags (comma separated)"
                    value={(i.tags ?? []).join(", ")}
                    onChange={(v) =>
                      patch({
                        items: core.items.map((x) =>
                          x.id === i.id ? { ...x, tags: v.split(",").map((t) => t.trim()).filter(Boolean) } : x,
                        ),
                      })
                    }
                  />
                </div>
                <div className="mt-4 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      archive(i.kind === "project" ? "projects" : i.kind === "service" ? "services" : "offerings", i.id)
                    }
                  >
                    <Archive className="mr-1.5 h-3.5 w-3.5" /> Archive
                  </Button>
                </div>
              </div>
            ))
          )}
        </Card>

        <Card
          title="FAQ"
          hint="Answer the questions people actually ask. These become faq.md."
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => patch({ faqs: [...core.faqs, { id: kcId(), question: "", answer: "" }] })}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
            </Button>
          }
        >
          {core.faqs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No answers yet.</p>
          ) : (
            core.faqs.map((f) => (
              <div key={f.id} className="rounded-xl border border-border/70 p-4">
                <Field
                  label="Question"
                  value={f.question}
                  onChange={(v) => patch({ faqs: core.faqs.map((x) => (x.id === f.id ? { ...x, question: v } : x)) })}
                />
                <div className="mt-4">
                  <Field
                    label="Answer"
                    value={f.answer}
                    multiline
                    onChange={(v) => patch({ faqs: core.faqs.map((x) => (x.id === f.id ? { ...x, answer: v } : x)) })}
                  />
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => archive("faqs", f.id)}>
                    <Archive className="mr-1.5 h-3.5 w-3.5" /> Archive
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (!window.confirm("Delete this FAQ entry permanently? It will disappear from your Presence after the next publish.")) return;
                      patch({ faqs: core.faqs.filter((x) => x.id !== f.id) });
                      toast.success("FAQ entry deleted. Save, then publish to update your live Presence.");
                    }}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                  </Button>
                </div>

              </div>
            ))
          )}
        </Card>

        <RecordSection
          title="Audiences"
          hint="Who is this for? Assistants use this to decide when to recommend you."
          records={ext.audiences}
          onChange={setExtList("audiences")}
          onArchive={(id) => archive("audiences", id)}
          titleLabel="Audience"
          bodyLabel="What they need from you"
        />

        <RecordSection
          title="Pricing"
          hint="Only state prices you actually charge. Wrong prices damage trust instantly."
          records={ext.pricing}
          onChange={setExtList("pricing")}
          onArchive={(id) => archive("pricing", id)}
          titleLabel="Plan or item"
          bodyLabel="Price and conditions"
        />

        <RecordSection
          title="News & updates"
          hint="Recent developments keep your Presence current."
          records={ext.news}
          onChange={setExtList("news")}
          onArchive={(id) => archive("news", id)}
          titleLabel="Headline"
          bodyLabel="What happened"
        />

        <Card
          title="Links"
          hint="Contact and profile links."
          action={
            <Button size="sm" variant="outline" onClick={() => patch({ links: [...core.links, { label: "", url: "" }] })}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
            </Button>
          }
        >
          {core.links.length === 0 ? (
            <p className="text-sm text-muted-foreground">No links yet.</p>
          ) : (
            core.links.map((l, idx) => (
              <div key={`${l.url}-${idx}`} className="grid gap-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
                <Field
                  label="Label"
                  value={l.label}
                  onChange={(v) => patch({ links: core.links.map((x, i) => (i === idx ? { ...x, label: v } : x)) })}
                />
                <Field
                  label="URL"
                  value={l.url}
                  onChange={(v) => patch({ links: core.links.map((x, i) => (i === idx ? { ...x, url: v } : x)) })}
                />
                <Button size="sm" variant="ghost" onClick={() => archive("links", l.url)}>
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </Card>
        </div>
      </div>
    </div>
  );
}


import { Plus, Archive } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  EVIDENCE_STATUSES,
  VISIBILITIES,
  evidenceLabel,
  kcId,
  visibilityLabel,
  type ExtRecord,
} from "@/lib/kc/model";

export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      {multiline ? (
        <Textarea
          className="mt-1.5 min-h-24"
          value={value}
          placeholder={placeholder ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          className="mt-1.5"
          value={value}
          placeholder={placeholder ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<string, string>;
  onChange: (v: T) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <select
        className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {labels[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Card({
  title,
  hint,
  children,
  action,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

export const newExtRecord = (): ExtRecord => ({
  id: kcId(),
  title: "",
  body: "",
  status: "provider_statement",
  visibility: "public",
  updatedAt: new Date().toISOString(),
});

/** Shared editor for the extended list sections (audiences, pricing, news). */
export function RecordSection({
  title,
  hint,
  records,
  onChange,
  onArchive,
  titleLabel = "Title",
  bodyLabel = "Details",
}: {
  title: string;
  hint: string;
  records: ExtRecord[];
  onChange: (next: ExtRecord[]) => void;
  onArchive: (id: string) => void;
  titleLabel?: string;
  bodyLabel?: string;
}) {
  const patch = (id: string, part: Partial<ExtRecord>) =>
    onChange(records.map((r) => (r.id === id ? { ...r, ...part, updatedAt: new Date().toISOString() } : r)));

  return (
    <Card
      title={title}
      hint={hint}
      action={
        <Button size="sm" variant="outline" onClick={() => onChange([...records, newExtRecord()])}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
        </Button>
      }
    >
      {records.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        records.map((r) => (
          <div key={r.id} className="rounded-xl border border-border/70 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={titleLabel} value={r.title} onChange={(v) => patch(r.id, { title: v })} />
              <Field label="Source (optional)" value={r.source ?? ""} onChange={(v) => patch(r.id, { source: v })} />
            </div>
            <div className="mt-4">
              <Field label={bodyLabel} value={r.body ?? ""} multiline onChange={(v) => patch(r.id, { body: v })} />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Evidence"
                value={r.status}
                options={EVIDENCE_STATUSES}
                labels={evidenceLabel}
                onChange={(v) => patch(r.id, { status: v })}
              />
              <SelectField
                label="Visibility"
                value={r.visibility}
                options={VISIBILITIES}
                labels={visibilityLabel}
                onChange={(v) => patch(r.id, { visibility: v })}
              />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Badge variant="secondary" className="text-[11px]">
                Updated {new Date(r.updatedAt).toISOString().slice(0, 10)}
              </Badge>
              <Button size="sm" variant="ghost" onClick={() => onArchive(r.id)}>
                <Archive className="mr-1.5 h-3.5 w-3.5" /> Archive
              </Button>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

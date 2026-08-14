/**
 * Knowledge Core Editor — pure apply / archive / version helpers.
 *
 * Nothing here talks to the network. A proposal is only ever applied to the
 * local workspace after the user confirmed it; publishing stays a separate,
 * explicit step.
 */

import type { KnowledgeCore } from "../knowledge";
import {
  getExt,
  kcId,
  sectionLabel,
  withExt,
  type ArchivedEntry,
  type CoreExtension,
  type ExtRecord,
  type Organization,
  type Proposal,
  type SectionKey,
  type Version,
} from "./model";

const now = () => new Date().toISOString();

const listKinds: Partial<Record<SectionKey, "offering" | "project" | "service">> = {
  offerings: "offering",
  projects: "project",
  services: "service",
};

/* ------------------------------------------------------------------ */
/* Reading the current value for a proposal target                     */
/* ------------------------------------------------------------------ */

export function currentValueFor(core: KnowledgeCore, section: SectionKey, target?: string): string {
  const ext = getExt(core);
  switch (section) {
    case "identity": {
      const key = (target ?? "") as keyof KnowledgeCore;
      const v = core[key];
      return Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : "";
    }
    case "organization":
      return (ext.organization[(target ?? "") as keyof Organization] ?? "") as string;
    case "facts": {
      const f = core.facts.find((x) => x.id === target);
      return f ? `${f.label}: ${f.value}` : "";
    }
    case "stories": {
      const s = core.stories.find((x) => x.id === target);
      return s ? s.text : "";
    }
    case "faqs": {
      const f = core.faqs.find((x) => x.id === target);
      return f ? `${f.question} — ${f.answer}` : "";
    }
    case "cv": {
      const e = core.cv.find((x) => x.id === target);
      return e ? [e.period, e.role, e.organization].filter(Boolean).join(" · ") : "";
    }
    case "links": {
      const l = core.links.find((x) => x.url === target);
      return l ? `${l.label}: ${l.url}` : "";
    }
    case "offerings":
    case "projects":
    case "services": {
      const i = core.items.find((x) => x.id === target);
      return i ? `${i.name} — ${i.summary}` : "";
    }
    case "audiences":
    case "pricing":
    case "news": {
      const r = ext[section].find((x) => x.id === target);
      return r ? [r.title, r.body].filter(Boolean).join(" — ") : "";
    }
    default:
      return "";
  }
}

/* ------------------------------------------------------------------ */
/* Applying a proposal                                                 */
/* ------------------------------------------------------------------ */

/** Splits "Label: value" style proposals into title and body. */
function split(value: string): { head: string; rest: string } {
  const idx = value.indexOf(":");
  const dash = value.indexOf(" — ");
  if (dash > 0) return { head: value.slice(0, dash).trim(), rest: value.slice(dash + 3).trim() };
  if (idx > 0 && idx < 60) return { head: value.slice(0, idx).trim(), rest: value.slice(idx + 1).trim() };
  return { head: value.slice(0, 70).trim(), rest: value.trim() };
}

function extRecord(p: Proposal): ExtRecord {
  const { head, rest } = split(p.proposedValue);
  return {
    id: kcId(),
    title: head || p.label,
    body: rest && rest !== head ? rest : "",
    status: p.status,
    visibility: p.visibility,
    ...(p.source ? { source: p.source } : {}),
    updatedAt: now(),
  };
}

export function applyProposal(core: KnowledgeCore, p: Proposal): KnowledgeCore {
  const ext = getExt(core);
  const value = p.proposedValue.trim();

  if (p.action === "archive" || p.action === "delete") {
    return archiveRecord(core, p.section, p.target ?? "", p.action === "delete");
  }
  if (p.action === "restore") {
    return restoreArchived(core, p.target ?? "");
  }

  switch (p.section) {
    case "identity": {
      const key = p.target ?? "summary";
      if (key === "languages") return { ...core, languages: value.split(/[,;]/).map((s) => s.trim()).filter(Boolean), updatedAt: now() };
      return { ...core, [key]: value, updatedAt: now() } as KnowledgeCore;
    }
    case "organization": {
      const key = (p.target ?? "legalName") as keyof Organization;
      return withExt(core, { ...ext, organization: { ...ext.organization, [key]: value } });
    }
    case "facts": {
      const { head, rest } = split(value);
      const existing = core.facts.find((f) => f.id === p.target);
      const status = p.status === "verified_fact" || p.status === "provider_statement" ? "verified" : "claimed";
      const fact = {
        id: existing?.id ?? kcId(),
        label: head || p.label,
        value: rest || value,
        status: status as "verified" | "claimed",
        ...(p.source ? { source: p.source } : {}),
      };
      const facts = existing ? core.facts.map((f) => (f.id === existing.id ? fact : f)) : [...core.facts, fact];
      return withExt(
        { ...core, facts },
        { ...ext, evidence: { ...ext.evidence, [fact.id]: { status: p.status, visibility: p.visibility, ...(p.source ? { source: p.source } : {}) } } },
      );
    }
    case "stories": {
      const existing = core.stories.find((s) => s.id === p.target);
      const story = { id: existing?.id ?? kcId(), label: p.label || "Positioning", text: value, confirmed: true };
      return {
        ...core,
        stories: existing ? core.stories.map((s) => (s.id === existing.id ? story : s)) : [...core.stories, story],
        updatedAt: now(),
      };
    }
    case "faqs": {
      const { head, rest } = split(value);
      const existing = core.faqs.find((f) => f.id === p.target);
      const faq = { id: existing?.id ?? kcId(), question: head || p.label, answer: rest || value };
      return {
        ...core,
        faqs: existing ? core.faqs.map((f) => (f.id === existing.id ? faq : f)) : [...core.faqs, faq],
        updatedAt: now(),
      };
    }
    case "cv": {
      const existing = core.cv.find((e) => e.id === p.target);
      const entry = { id: existing?.id ?? kcId(), role: p.label || value.slice(0, 60), note: value };
      return {
        ...core,
        cv: existing ? core.cv.map((e) => (e.id === existing.id ? { ...e, note: value } : e)) : [...core.cv, entry],
        updatedAt: now(),
      };
    }
    case "links": {
      const url = value.match(/https?:\/\/\S+|mailto:\S+/)?.[0] ?? value;
      const label = p.label || split(value).head || "Link";
      const links = core.links.some((l) => l.url === url)
        ? core.links.map((l) => (l.url === url ? { label, url } : l))
        : [...core.links, { label, url }];
      return { ...core, links, updatedAt: now() };
    }
    case "offerings":
    case "projects":
    case "services": {
      const kind = listKinds[p.section]!;
      const { head, rest } = split(value);
      const existing = core.items.find((i) => i.id === p.target);
      const item = {
        id: existing?.id ?? kcId(),
        kind,
        name: head || p.label,
        summary: rest || value,
        ...(existing?.details ? { details: existing.details } : {}),
        ...(existing?.url ? { url: existing.url } : {}),
      };
      return {
        ...core,
        items: existing ? core.items.map((i) => (i.id === existing.id ? { ...i, ...item } : i)) : [...core.items, item],
        updatedAt: now(),
      };
    }
    case "audiences":
    case "pricing":
    case "news": {
      const list = ext[p.section];
      const existing = list.find((r) => r.id === p.target);
      const rec = existing ? { ...existing, ...extRecord(p), id: existing.id } : extRecord(p);
      return withExt(core, {
        ...ext,
        [p.section]: existing ? list.map((r) => (r.id === existing.id ? rec : r)) : [...list, rec],
      } as CoreExtension);
    }
    default:
      return core;
  }
}

/* ------------------------------------------------------------------ */
/* Archive / restore                                                   */
/* ------------------------------------------------------------------ */

export function archiveRecord(core: KnowledgeCore, section: SectionKey, id: string, hard = false): KnowledgeCore {
  const ext = getExt(core);
  const label = currentValueFor(core, section, id) || sectionLabel[section];
  let record: { [key: string]: import("./model").Json } | null = null;
  let next: KnowledgeCore = core;

  switch (section) {
    case "facts":
      record = (core.facts.find((f) => f.id === id) as never) ?? null;
      next = { ...core, facts: core.facts.filter((f) => f.id !== id) };
      break;
    case "stories":
      record = (core.stories.find((s) => s.id === id) as never) ?? null;
      next = { ...core, stories: core.stories.filter((s) => s.id !== id) };
      break;
    case "faqs":
      record = (core.faqs.find((f) => f.id === id) as never) ?? null;
      next = { ...core, faqs: core.faqs.filter((f) => f.id !== id) };
      break;
    case "cv":
      record = (core.cv.find((e) => e.id === id) as never) ?? null;
      next = { ...core, cv: core.cv.filter((e) => e.id !== id) };
      break;
    case "links":
      record = (core.links.find((l) => l.url === id) as never) ?? null;
      next = { ...core, links: core.links.filter((l) => l.url !== id) };
      break;
    case "offerings":
    case "projects":
    case "services":
      record = (core.items.find((i) => i.id === id) as never) ?? null;
      next = { ...core, items: core.items.filter((i) => i.id !== id) };
      break;
    case "audiences":
    case "pricing":
    case "news": {
      record = (ext[section].find((r) => r.id === id) as never) ?? null;
      const list = ext[section].filter((r) => r.id !== id);
      next = withExt(core, { ...ext, [section]: list } as CoreExtension);
      break;
    }
    default:
      return core;
  }

  if (!record) return core;
  const nextExt = getExt(next);
  const entry: ArchivedEntry = { id: kcId(), section, archivedAt: now(), label, record };
  return withExt(next, { ...nextExt, archive: hard ? nextExt.archive : [entry, ...nextExt.archive].slice(0, 200) });
}

export function restoreArchived(core: KnowledgeCore, archiveId: string): KnowledgeCore {
  const ext = getExt(core);
  const entry = ext.archive.find((a) => a.id === archiveId);
  if (!entry) return core;
  const rest = ext.archive.filter((a) => a.id !== archiveId);
  const r = entry.record as Record<string, unknown>;

  switch (entry.section) {
    case "facts":
      return withExt({ ...core, facts: [...core.facts, r as never] }, { ...ext, archive: rest });
    case "stories":
      return withExt({ ...core, stories: [...core.stories, r as never] }, { ...ext, archive: rest });
    case "faqs":
      return withExt({ ...core, faqs: [...core.faqs, r as never] }, { ...ext, archive: rest });
    case "cv":
      return withExt({ ...core, cv: [...core.cv, r as never] }, { ...ext, archive: rest });
    case "links":
      return withExt({ ...core, links: [...core.links, r as never] }, { ...ext, archive: rest });
    case "offerings":
    case "projects":
    case "services":
      return withExt({ ...core, items: [...core.items, r as never] }, { ...ext, archive: rest });
    case "audiences":
    case "pricing":
    case "news":
      return withExt(core, { ...ext, archive: rest, [entry.section]: [...ext[entry.section], r as never] } as CoreExtension);
    default:
      return core;
  }
}

export function purgeArchived(core: KnowledgeCore, archiveId: string): KnowledgeCore {
  const ext = getExt(core);
  return withExt(core, { ...ext, archive: ext.archive.filter((a) => a.id !== archiveId) });
}

/* ------------------------------------------------------------------ */
/* Versions                                                            */
/* ------------------------------------------------------------------ */

export function snapshot(core: KnowledgeCore, label: string): Version {
  return { id: kcId(), at: now(), label, core: JSON.parse(JSON.stringify(core)) as KnowledgeCore };
}

/** Small structural summary used in the version list. */
export function coreStats(core: KnowledgeCore) {
  const ext = getExt(core);
  return {
    facts: core.facts.length,
    items: core.items.length,
    faqs: core.faqs.length,
    extra: ext.audiences.length + ext.pricing.length + ext.news.length,
  };
}

/* ------------------------------------------------------------------ */
/* Diff                                                                */
/* ------------------------------------------------------------------ */

export type DiffLine = { kind: "add" | "update" | "remove" | "same"; text: string };

export function proposalDiff(p: Proposal): DiffLine[] {
  if (p.action === "add") return [{ kind: "add", text: p.proposedValue }];
  if (p.action === "archive" || p.action === "delete")
    return [{ kind: "remove", text: p.currentValue || p.label }];
  if (p.action === "restore") return [{ kind: "add", text: p.currentValue || p.label }];
  return [
    { kind: "remove", text: p.currentValue || "(empty)" },
    { kind: "update", text: p.proposedValue },
  ];
}

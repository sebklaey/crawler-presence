import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell, PageHead } from "@/components/app-shell";

export const Route = createFileRoute("/chatgpt")({
  head: () => ({
    meta: [
      { title: "Use Crawler in ChatGPT — MCP setup" },
      {
        name: "description",
        content:
          "Connect the Crawler MCP endpoint to ChatGPT Developer Mode and run the whole Presence interview inside the conversation with @Crawler.",
      },
      { property: "og:title", content: "Use Crawler in ChatGPT — MCP setup" },
      {
        property: "og:description",
        content: "Add the Crawler /mcp endpoint in ChatGPT Developer Mode and build your AI-readable Presence in chat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatGptPage,
});

const steps = [
  {
    title: "Open ChatGPT settings and enable Developer Mode",
    body: "Developer Mode is what allows a custom MCP connector to be added. Without it the connector form is not available.",
  },
  {
    title: "Add the Crawler MCP endpoint",
    body: "Create a new connector and paste the deployed HTTPS endpoint below as the MCP server URL. Authentication: none — this MVP is a public, no-auth server.",
  },
  {
    title: "Install the connector",
    body: "Confirm the tool list. You should see start_interview, continue_interview, analyze_source_url, get_knowledge_core, preview_presence, publish_presence, get_pricing, get_analytics, improve_presence, get_checkout_link and get_status.",
  },
  {
    title: "Switch to ChatGPT Work",
    body: "@ invocation of connectors is currently documented for ChatGPT Work. Use that surface for the steps below.",
  },
  {
    title: "Type @ and select Crawler",
    body: "Then simply describe what you do, or paste your website link. Crawler infers your entity type and asks one adaptive question at a time.",
  },
];

const tools: { name: string; kind: string; text: string }[] = [
  { name: "start_interview", kind: "write", text: "Free text (+ optional URL) → session_id, first Knowledge Core, first adaptive question." },
  { name: "continue_interview", kind: "write", text: "Answer → merged Knowledge Core and the next tailored question, or interview_complete." },
  { name: "analyze_source_url", kind: "read", text: "Reads a public HTTPS page and returns candidate facts with provenance and confidence, or an honest unavailable result." },
  { name: "get_knowledge_core", kind: "read", text: "The full structured Knowledge Core for a session." },
  { name: "preview_presence", kind: "read", text: "llms.txt, llms-full.txt, about.md and the relevant markdown and JSON previews." },
  { name: "publish_presence", kind: "write", text: "Publishes for real once hosting has been paid for this draft, and returns the one-time recovery code; otherwise returns publish_requires_payment and a handoff URL." },
  { name: "get_pricing", kind: "read", text: "Plus $5, Pro $20, Business $80 per month with feature differences." },
  { name: "get_analytics", kind: "read", text: "Clearly labelled demo analytics for 7/30/90 days, plus an AI summary of recurring questions and gaps." },
  { name: "improve_presence", kind: "read", text: "Turns an insight into the fields to clarify and one targeted question." },
  { name: "get_checkout_link", kind: "read", text: "External checkout URL; labelled demo mode when no payment credentials are configured." },
  { name: "get_status", kind: "read", text: "Health and debug output: auth mode (none), model availability, session store, checkout mode." },
];

function ChatGptPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="MCP connector"
          title="Use Crawler inside ChatGPT."
          description="The whole workflow — interview, Knowledge Core, file previews, analytics — runs in the conversation. You only visit this website to pay for hosting and to manage a published Presence."
        />

        <ConnectorUrl />

        <ol className="mb-12 space-y-4">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-4 rounded-xl border border-border/70 px-4 py-4">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs text-background">
                {i + 1}
              </span>
              <div>
                <div className="text-sm font-medium">{s.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <h2 className="display mb-4 text-2xl">Tools</h2>
        <div className="mb-12 divide-y divide-border/70 rounded-xl border border-border/70">
          {tools.map((t) => (
            <div key={t.name} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
              <code className="w-56 shrink-0 text-sm">{t.name}</code>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t.kind === "read" ? "read-only" : "writes session state"}
              </span>
              <p className="text-sm text-muted-foreground">{t.text}</p>
            </div>
          ))}
        </div>

        <h2 className="display mb-4 text-2xl">How ownership works without accounts</h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">No authentication on the endpoint.</strong> Every tool is public.
            Anyone with the connector URL can call it, so treat a session token like a shareable link.
          </li>
          <li>
            <strong className="text-foreground">ChatGPT account identity is not passed to Crawler.</strong> The server
            cannot see who you are and never treats a ChatGPT account as a Crawler user.
          </li>
          <li>
            <strong className="text-foreground">Building and previewing are free and need no Crawler account.</strong>{" "}
            Interview, Knowledge Core, corrections, file previews, pricing and analytics questions all run in the
            conversation.
          </li>
          <li>
            <strong className="text-foreground">Drafts are durable but anonymous.</strong> Sessions are stored in the
            database for ~30 days under an opaque random token. Crawler has no user registration, no login and no user
            accounts, so a draft is never tied to a person.
          </li>
          <li>
            <strong className="text-foreground">Ownership is a code, not an account.</strong> When you publish, Crawler
            issues a one-time 256-bit recovery code. It controls the Presence: take it offline, put it back online, rotate the
            code and manage the subscription at /manage. Only a one-way hash is stored, so a lost code cannot be
            recovered by anyone — including Crawler.
          </li>
          <li>
            <strong className="text-foreground">Publishing is the paid step.</strong> publish_presence hands off to the
            website with your draft attached. Payment details go to the payment provider only — no Crawler account is
            created. When payment keys are absent the same flow runs in clearly labelled DEMO/TEST mode and no charge
            is made.
          </li>
          <li>
            <strong className="text-foreground">Analytics are labelled DEMO.</strong> Crawler never has access to
            private ChatGPT, Claude or Gemini conversations — only Crawler-internal events and observable reads of
            published files.
          </li>
        </ul>
      </div>
    </AppShell>
  );
}

function ConnectorUrl() {
  const [origin, setOrigin] = useState("https://crawler-presence.lovable.app");
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/public/mcp-health")
      .then((r) => r.json())
      .then((d) => setHealth(d as Record<string, unknown>))
      .catch(() => setFailed(true));
  }, []);

  const url = `${origin}/mcp`;
  const store = (health?.["session_store"] ?? null) as { type?: string; active_sessions?: number } | null;

  return (
    <div className="mb-10 space-y-3">
      <div className="rounded-xl border border-border bg-secondary/50 px-4 py-3">
        <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Connector URL</div>
        <div className="flex flex-wrap items-center gap-3">
          <code className="break-all font-mono text-sm">{url}</code>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(url)}
            aria-label="Copy the connector URL"
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Copy
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-border/70 px-4 py-3 text-xs text-muted-foreground">
        <span className="text-foreground">Live health:</span>{" "}
        {failed
          ? "unavailable"
          : health
            ? `${String(health["status"])} · auth ${String(health["auth_mode"])} · sessions ${store?.type ?? "?"} (${store?.active_sessions ?? 0} active) · checkout ${String(health["checkout_mode"])} · analytics ${String(health["analytics_mode"])}`
            : "checking…"}{" "}
        <a href="/api/public/mcp-health" className="underline underline-offset-4">
          /api/public/mcp-health
        </a>
      </div>
    </div>
  );
}

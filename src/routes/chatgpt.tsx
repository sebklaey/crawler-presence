import { createFileRoute } from "@tanstack/react-router";

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
  { name: "publish_presence", kind: "write", text: "Never publishes in no-auth mode — returns publish_requires_account and an account-link URL." },
  { name: "get_pricing", kind: "read", text: "Plus $5, Pro $20, Business $80 per month with feature differences." },
  { name: "get_analytics", kind: "read", text: "Clearly labelled demo analytics for 7/30/90 days, plus an AI summary of recurring questions and gaps." },
  { name: "improve_presence", kind: "read", text: "Turns an insight into the fields to clarify and one targeted question." },
  { name: "get_checkout_link", kind: "read", text: "External checkout URL; labelled demo mode when Stripe is not configured." },
  { name: "get_status", kind: "read", text: "Health and debug output: auth mode, model availability, session store, checkout mode." },
];

function ChatGptPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="MCP connector"
          title="Use Crawler inside ChatGPT."
          description="The whole workflow — interview, Knowledge Core, file previews, analytics — runs in the conversation. You only visit this website for checkout."
        />

        <div className="mb-10 rounded-xl border border-border bg-secondary/50 px-4 py-3 font-mono text-sm">
          <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">MCP endpoint</div>
          <code className="break-all">https://&lt;your-deployed-crawler-domain&gt;/mcp</code>
        </div>

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

        <h2 className="display mb-4 text-2xl">What this MVP does not do</h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">No authentication.</strong> Every tool is public. Anyone with the
            endpoint URL can call it.
          </li>
          <li>
            <strong className="text-foreground">No account identity.</strong> The server cannot see who you are in
            ChatGPT and never treats a ChatGPT account as a Crawler user.
          </li>
          <li>
            <strong className="text-foreground">No durable storage.</strong> A session is an opaque, ephemeral
            in-memory id that expires after a few hours. Nothing user-specific is persisted across users or deploys.
          </li>
          <li>
            <strong className="text-foreground">No publishing.</strong> publish_presence returns an account-link URL
            instead of hosting private data. Creating and previewing stay free.
          </li>
          <li>
            <strong className="text-foreground">Demo analytics only.</strong> Crawler never has access to private
            ChatGPT, Claude or Gemini conversations — only Crawler-internal events and observable reads of published
            files.
          </li>
        </ul>
        <p className="mt-6 text-sm text-muted-foreground">
          Durable per-user persistence, subscription status and private analytics will require account linking with
          OAuth 2.1. That is the next step after this MVP.
        </p>
      </div>
    </AppShell>
  );
}

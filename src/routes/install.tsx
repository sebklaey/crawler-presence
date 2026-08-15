import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell, PageHead } from "@/components/app-shell";
import pluginDialog from "@/assets/crawler-mcp-plugin-dialog.png.asset.json";

const MCP_URL = "https://crawler.today/mcp";

const INSTALL_STEPS = [
  {
    title: "Turn on developer mode",
    body: "In ChatGPT open Settings → Apps & Connectors → Advanced settings and enable developer mode. Custom MCP connectors only appear once it is on.",
  },
  {
    title: "Create a new plugin",
    body: "Go to Settings → Apps & Connectors → Create and choose a custom connector (MCP server).",
  },
  {
    title: "Fill in the details",
    body: "Name: Crawler · Description: AI-readable presence and chat · Connection: Server URL · Authentication: no authentication.",
  },
  {
    title: "Paste the MCP link",
    body: "Use the server URL below, confirm the security notice and press Create.",
  },
  {
    title: "Start talking",
    body: "Back in a chat, type “@crawler AI” — the connector answers directly inside ChatGPT.",
  },
];

export const Route = createFileRoute("/install")({
  head: () => ({
    meta: [
      { title: "Install @crawler in ChatGPT — MCP server URL" },
      {
        name: "description",
        content:
          "Step-by-step: enable ChatGPT developer mode, create a custom MCP connector and paste the Crawler server URL to use @crawler in any chat.",
      },
      { property: "og:title", content: "Install @crawler in ChatGPT — MCP server URL" },
      {
        property: "og:description",
        content:
          "Enable developer mode, add the Crawler MCP server URL with no authentication and start talking to @crawler.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InstallPage,
});

function InstallPage() {
  const [copied, setCopied] = useState(false);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-6 pb-24">
        <section className="py-14 sm:py-20">
          <PageHead
            eyebrow="ChatGPT connector"
            title="Install @crawler in ChatGPT."
            description="@crawler is a custom MCP connector. ChatGPT only shows custom connectors when developer mode is enabled — switch it on first, then add the server URL below."
          />

          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <ol className="space-y-6">
              {INSTALL_STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-xs font-medium text-muted-foreground">
                    {index + 1}
                  </span>
                  <div>
                    <h2 className="text-base font-semibold">{step.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <figure className="rounded-xl border border-border bg-card p-3">
              <img
                src={pluginDialog.url}
                alt="ChatGPT plugin dialog for adding the @crawler MCP server with no authentication"
                loading="lazy"
                className="w-full rounded-lg"
              />
              <figcaption className="px-2 py-3 text-xs text-muted-foreground">
                The ChatGPT plugin dialog for the @crawler MCP server — connection set to Server URL, no
                authentication.
              </figcaption>
            </figure>
          </div>

          <div className="mt-8 rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">MCP server URL</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <code className="flex-1 overflow-x-auto rounded-lg border border-border px-4 py-3 font-mono text-sm">
                {MCP_URL}
              </code>
              <button
                type="button"
                onClick={copyUrl}
                className="rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Authentication: none. ChatGPT will warn that custom MCP servers are unverified — confirm to
              continue.
            </p>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

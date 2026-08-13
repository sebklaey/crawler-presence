import { useState } from "react";
import { Check, Copy, Globe, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  manageRemoveDomainFn,
  manageSetDomainFn,
  manageVerifyDomainFn,
  type ManageOverview,
} from "@/lib/manage.functions";

type Overview = Extract<ManageOverview, { ok: true }>;

/** Small labelled code block with a one-click copy button. */
function CopyBlock({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success("Copied");
            setTimeout(() => setCopied(false), 1800);
          }}
        >
          {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/40 p-4 text-[11px] leading-relaxed">
        {value}
      </pre>
      {hint ? <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}


const REASONS: Record<string, string> = {
  plan: "Custom domains are part of the Pro and Business plans.",
  "invalid-domain": "That does not look like a domain. Use the bare form, for example studio.example.com.",
  "domain-taken": "That domain is already connected to another Presence.",
  unavailable: "Crawler is temporarily unavailable, so nothing was changed.",
  "txt-missing": "The TXT record is not visible yet. DNS can take a few minutes — try again shortly.",
};

/** Pro and Business: connect a custom domain that serves the Presence files. */
export function CustomDomainSection({
  code,
  data,
  refresh,
}: {
  code: string;
  data: Overview;
  refresh: () => Promise<void>;
}) {
  const state = data.customDomain;
  const [domain, setDomain] = useState(state.domain ?? "");
  const [busy, setBusy] = useState(false);

  async function run(action: "save" | "verify" | "remove") {
    setBusy(true);
    try {
      if (action === "save") {
        const result = await manageSetDomainFn({ data: { code, domain } });
        if (!result.ok) return void toast.error(REASONS[result.reason ?? ""] ?? "Could not save that domain.");
        toast.success("Domain saved. Add the DNS records, then verify.");
      } else if (action === "verify") {
        const result = await manageVerifyDomainFn({ data: { code } });
        if (!result.ok) return void toast.error(REASONS[result.reason ?? ""] ?? "Verification failed.");
        if (!result.verified) return void toast.error(REASONS["txt-missing"]);
        toast.success("Domain verified. Your Presence is now served from it.");
      } else {
        const result = await manageRemoveDomainFn({ data: { code } });
        if (!result.ok) return void toast.error(REASONS[result.reason ?? ""] ?? "Could not remove the domain.");
        setDomain("");
        toast.success("Custom domain removed.");
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Globe className="h-4 w-4" /> Custom domain
        </h2>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {state.verified ? "Verified" : state.domain ? "Pending DNS" : "Not connected"}
        </span>
      </div>

      {!state.allowedOnPlan ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Custom domains are included in Pro and Business. On your {data.plan} plan the Presence is served from{" "}
          <span className="font-mono text-xs">/p/{data.slug}</span>.
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            Serve <span className="font-mono">llms.txt</span> and the other generated files straight from your own
            domain, for example <span className="font-mono">example.com/llms.txt</span>.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Input
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="example.com"
              className="max-w-xs font-mono text-sm"
              disabled={busy}
            />
            <Button variant="outline" disabled={busy || domain.trim().length < 4} onClick={() => void run("save")}>
              {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              {state.domain ? "Update domain" : "Connect domain"}
            </Button>
            {state.domain ? (
              <>
                <Button variant="outline" disabled={busy} onClick={() => void run("verify")}>
                  Verify DNS
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => void run("remove")}>
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove
                </Button>
              </>
            ) : null}
          </div>

          {state.instructions ? (
            <div className="mt-5 space-y-2 rounded-xl border border-border bg-muted/40 p-4 text-xs">
              <div className="font-medium">DNS records for {state.domain}</div>
              <p className="font-mono">
                TXT&nbsp;&nbsp;{state.instructions.txtHost}.{state.domain} → {state.instructions.txtValue}
              </p>
              <p className="font-mono">
                CNAME&nbsp;&nbsp;{state.domain} → {state.instructions.cnameTarget}
              </p>
              <p className="text-muted-foreground">
                The TXT record proves ownership; the CNAME routes traffic to Crawler. Files are only served once
                verification succeeds.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Business: capability-authenticated REST API. */
export function ApiAccessSection({ data }: { data: Overview }) {
  if (!data.apiAccess) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-sm font-medium">API access</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Authenticate with your recovery code for <code>{data.slug}</code> — there is no separate API key and no
        account. Rate limit: 120 requests per minute.
      </p>
      <CopyBlock
        label="Your private API calls"
        value={`curl https://crawler.today/api/public/v1/presence \\
  -H "Authorization: Bearer ${data.slug}~<your recovery secret>"

curl "https://crawler.today/api/public/v1/analytics?days=90" \\
  -H "Authorization: Bearer ${data.slug}~<your recovery secret>"`}
        hint="Replace <your recovery secret> with the part after the ~ in your recovery code. Anyone holding it controls this Presence — rotate it above if it leaks."
      />
    </div>
  );
}

/** Post-publish: how compatible AI systems can retrieve this Knowledge Core. */
export function AiRetrievalSection({ data }: { data: Overview }) {
  const identifier = data.entityDomain ?? data.slug;
  const query = data.entityDomain ? `domain=${data.entityDomain}` : `id=${data.slug}`;
  const apiUrl = `https://crawler.today/api/crawl-me?${query}`;
  const cleanUrl = `https://crawler.today/c/${data.slug}`;
  const publicUrl = `https://crawler.today/p/${data.slug}`;
  const llmsUrl = `${publicUrl}/llms.txt`;

  const instruction = `Open these public web pages to get current, first-party information about ${data.name} (${identifier}) instead of relying on memory:

1. ${publicUrl}
2. ${llmsUrl}
3. ${cleanUrl}

Short summary: ${cleanUrl}/summary
A single topic (about, offerings, pricing, faq, contact, team, locations, links, facts): ${cleanUrl}/pricing

All of these are normal public pages, free to read, no key, no login. They are first-party information published by ${data.name} through Crawler Today.`;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-sm font-medium">Use your Knowledge Core with AI</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Copy the block below and paste it into ChatGPT, Claude, Gemini or your own agent's instructions. It contains
        your personal CrawlMe endpoints, so the assistant can find and fetch your latest published Knowledge Core.
        Crawler Today cannot make any AI model train on or memorise your information — it provides a reliable place to
        look it up.
      </p>

      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Your canonical identifier</dt>
          <dd className="mt-1"><code>{identifier}</code></dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Published version</dt>
          <dd className="mt-1">
            v{data.version} · updated{" "}
            {new Date(data.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </dd>
        </div>
      </dl>

      <CopyBlock
        label="Paste into your AI assistant"
        value={instruction}
        hint="Uses plain page URLs without query parameters — assistants like Gemini often refuse URLs that look like a parameterised API."
      />

      <CopyBlock label="Your CrawlMe URL (no parameters)" value={cleanUrl} />

      <CopyBlock label="Classic API URL (with parameters)" value={apiUrl} />

      <CopyBlock
        label="Test it from a terminal"
        value={`curl "${cleanUrl}"`}
      />


      <p className="mt-4 text-xs text-muted-foreground">
        MCP clients (ChatGPT developer mode, Claude, agents) can instead connect the Crawler Today MCP server at{" "}
        <code>https://crawler.today/mcp</code> and use <code>search_entities</code>, <code>get_entity</code>,{" "}
        <code>get_entity_summary</code>, <code>get_entity_section</code> and <code>get_entity_updates</code> with the
        identifier <code>{identifier}</code>.
      </p>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Read the <a className="underline underline-offset-4" href="/crawlme">CrawlMe developer documentation</a>.
      </p>

    </div>
  );
}

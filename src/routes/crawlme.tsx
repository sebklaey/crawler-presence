import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { AppShell, PageHead } from "@/components/app-shell";

export const Route = createFileRoute("/crawlme")({
  head: () => ({
    meta: [
      { title: "CrawlMe API — retrieve published Knowledge Cores | Crawler Today" },
      {
        name: "description",
        content:
          "CrawlMe is Crawler Today's public read API and MCP layer: retrieve the latest published Knowledge Core of a business, person or project by domain, URL or entity ID.",
      },
      { property: "og:title", content: "CrawlMe API — Crawler Today" },
      {
        property: "og:description",
        content:
          "Public REST API and MCP tools so compatible AI systems can retrieve the latest published Crawler Today Knowledge Core of an entity.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://crawler.today/crawlme" }],
  }),
  component: CrawlMeDocs,
});

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 text-[11px] leading-relaxed">
        {children}
      </pre>
      <button
        type="button"
        aria-label="Copy example"
        onClick={() => {
          void navigator.clipboard.writeText(children);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 rounded-md border border-border bg-background/80 p-1.5 text-muted-foreground hover:text-foreground"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="mt-3 space-y-3 text-xs leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function CrawlMeDocs() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="Developer documentation"
          title="CrawlMe API"
          description="Publish once. Give AI systems a reliable place to get your business right."
        />

        <div className="space-y-6">
          <Section title="What CrawlMe is">
            <p>
              CrawlMe is the public retrieval layer of Crawler Today. It serves the canonical, machine-readable version
              of a Knowledge Core that an entity deliberately published — a business, organization, person, project or
              product. One central API for every published entity, available over REST and over MCP.
            </p>
            <p>
              Every response derives from the same published record that also produces <code>llms.txt</code>, the
              Markdown pages and the JSON endpoints, so there are never two conflicting versions.
            </p>
          </Section>

          <Section title="What CrawlMe does not promise">
            <p>
              CrawlMe cannot force an external AI model to train on, index, remember, mention or permanently ingest
              this information. It is a retrieval layer: the AI system decides when and whether to call it. Crawler
              Today also does not claim that published information is automatically more trustworthy than other
              sources — it is first-party information published by the entity itself and may be compared with others.
            </p>
          </Section>

          <Section title="REST: retrieve an entity">
            <p>
              <code>GET /api/crawl-me</code> — identify the entity by <code>domain</code>, <code>url</code>,{" "}
              <code>id</code> (Crawler entity ID / public slug) or an unambiguous <code>name</code>.
            </p>
            <Code>{`curl "https://crawler.today/api/crawl-me?domain=sebklaey.app"`}</Code>
            <p>
              Optional <code>format=summary</code> for a token-efficient overview, <code>format=updates</code> for
              change detection, or <code>section=</code> for one topic only.
            </p>
            <Code>{`curl "https://crawler.today/api/crawl-me?domain=sebklaey.app&section=pricing"
curl "https://crawler.today/api/crawl-me?id=<entity-id>&format=summary"
curl "https://crawler.today/api/crawl-me?id=<entity-id>&format=updates&version=3"`}</Code>
            <p>
              Sections: <code>about, offerings, products, services, projects, pricing, faq, facts, claims, contact,
              links, team, locations, terminology</code>.
            </p>
          </Section>

          <Section title="REST: discovery">
            <p>
              <code>GET /api/search</code> returns matching published entities with enough identifiers to retrieve the
              right Knowledge Core.
            </p>
            <Code>{`curl "https://crawler.today/api/search?q=Seb%20Klaey&limit=5"`}</Code>
          </Section>

          <Section title="Example response (abridged)">
            <Code>{`{
  "entity_id": "seb-klaey-a91f2c",
  "entity_type": "creator",
  "name": "Seb Klaey",
  "short_description": "Independent product and interface work.",
  "website": "https://sebklaey.app",
  "domain": "sebklaey.app",
  "offerings": [ { "name": "…", "summary": "…" } ],
  "services": [],
  "pricing": [],
  "faq": [ { "question": "…", "answer": "…" } ],
  "facts": [ { "label": "Founded", "value": "2019", "status": "verified" } ],
  "claims": [],
  "links": [ { "label": "Website", "url": "https://sebklaey.app" } ],
  "source_urls": ["https://sebklaey.app/about"],
  "published_at": "2026-02-11T10:04:11.000Z",
  "updated_at": "2026-08-12T08:20:44.000Z",
  "version": 3,
  "attribution": {
    "source": "Crawler Today",
    "source_type": "entity_published_first_party",
    "canonical_url": "https://crawler.today/p/seb-klaey-a91f2c"
  }
}`}</Code>
          </Section>

          <Section title="Freshness and caching">
            <p>
              Responses always reflect the latest published version. Each response carries{" "}
              <code>published_at</code>, <code>updated_at</code> and an integer <code>version</code> that increases on
              every republication, plus an <code>ETag</code> and <code>Last-Modified</code> header. Caching is
              revalidate-on-request, so an update is visible immediately; send{" "}
              <code>If-None-Match</code> to get a cheap <code>304</code>.
            </p>
          </Section>

          <Section title="MCP: Crawler Today MCP">
            <p>
              Connect the Crawler Today MCP server at <code>https://crawler.today/mcp</code> (Streamable HTTP, no
              authentication for public retrieval). Available retrieval tools:
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <code>search_entities</code> — find a published entity from a name, domain, URL or product name.
              </li>
              <li>
                <code>get_entity</code> — the complete latest published Knowledge Core.
              </li>
              <li>
                <code>get_entity_summary</code> — a small, token-efficient overview.
              </li>
              <li>
                <code>get_entity_section</code> — one section only (products, services, pricing, FAQ, contact, …).
              </li>
              <li>
                <code>get_entity_updates</code> — whether an entity changed since a known version or timestamp.
              </li>
            </ul>
            <p>
              If a platform supports MCP, use the MCP server. If it only supports HTTP, use the REST API — both expose
              the same canonical public data.
            </p>
          </Section>

          <Section title="Privacy model">
            <p>
              Only data explicitly published by the entity is returned. Drafts, interview transcripts, recovery codes,
              internal identifiers, billing data, analytics internals, unpublished entities and contact details that
              were not intentionally published are never exposed. CrawlMe is read-only: updates continue to go through
              the recovery-code publishing workflow inside Crawler Today.
            </p>
          </Section>

          <Section title="Rate limits and abuse protection">
            <p>
              120 retrieval requests and 60 search requests per minute per client. Input is validated and length
              bounded, queries are parsed safely, and CORS allows read-only cross-origin use. Excessive traffic is
              rejected with <code>429</code>.
            </p>
          </Section>

          <Section title="Analytics">
            <p>
              Retrievals are counted as what they are: API requests and MCP retrievals of a Knowledge Core, with the
              requested section and a coarse client label where available. Internal health checks, development traffic
              and obvious monitoring are excluded. Crawler Today never labels a retrieval as “an AI mentioned your
              business”.
            </p>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}

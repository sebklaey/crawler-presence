import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHead } from "@/components/app-shell";
import { getPublishedFn } from "@/lib/presence.functions";

export const Route = createFileRoute("/p/$slug/")({
  loader: ({ params }) => getPublishedFn({ data: { slug: params.slug } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.found ? loaderData.name || "Presence" : "Presence not found"} — Crawler` },
      {
        name: "description",
        content:
          loaderData?.found && loaderData.summary
            ? loaderData.summary.slice(0, 150)
            : "An AI-readable Crawler Presence: llms.txt, markdown pages and JSON endpoints at a stable public address.",
      },
      { property: "og:title", content: `${loaderData?.found ? loaderData.name || "Presence" : "Presence"} — Crawler` },
      {
        property: "og:description",
        content: "AI-readable presence files published by Crawler: llms.txt, markdown and JSON endpoints.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="mx-auto max-w-3xl px-5 py-20 text-sm text-muted-foreground">
        Could not load this presence: {String((error as Error)?.message ?? error)}
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="mx-auto max-w-3xl px-5 py-20 text-sm text-muted-foreground">Presence not found.</div>
    </AppShell>
  ),
  component: PublicPresence,
});

function PublicPresence() {
  const data = Route.useLoaderData();
  const { slug } = Route.useParams();

  if (!data?.found) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-5 py-20">
          <h1 className="display text-3xl">Presence not found</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            No published presence lives at <code>/p/{slug}</code>.{" "}
            <Link to="/publish" className="underline underline-offset-4">
              Publish one
            </Link>
            .
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow={data.mode === "demo" ? "Demo publish" : "Published presence"}
          title={data.name || slug}
          description={data.summary || data.tagline || "AI-readable presence files served from a stable address."}
        />

        {data.mode === "demo" ? (
          <div className="mb-8 rounded-xl border border-dashed border-border bg-secondary/60 px-4 py-3 text-xs text-muted-foreground">
            <strong className="text-foreground">DEMO / TEST publish.</strong> No payment credentials are configured on this
            deployment, so this presence was published without any payment. The files below are real and served from
            this address; the subscription is simulated.
          </div>
        ) : null}

        {data.website || data.links.length ? (
          <div className="mb-8 flex flex-wrap gap-2">
            {[
              ...(data.website ? [{ label: "Website", url: data.website }] : []),
              ...data.links,
            ].map((link: { label: string; url: string }) => (
              <a
                key={link.url}
                href={`/api/public/track/click?slug=${encodeURIComponent(slug)}&url=${encodeURIComponent(link.url)}`}
                rel="noopener noreferrer nofollow"
                target="_blank"
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </div>
        ) : null}

        <h2 className="display mb-3 text-2xl">Public files</h2>
        <ul className="divide-y divide-border/70 rounded-xl border border-border/70">
          {data.files.map((f: { path: string; type: string }) => (
            <li key={f.path} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <code className="break-all text-sm">/p/{slug}/{f.path}</code>
              <a
                href={`/p/${slug}/${f.path}`}
                className="text-xs underline underline-offset-4 text-muted-foreground hover:text-foreground"
                aria-label={`Open ${f.path}`}
              >
                Open
              </a>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-xs text-muted-foreground">
          Published {new Date(data.publishedAt).toLocaleString()} · plan {data.plan}
        </p>
      </div>
    </AppShell>
  );
}

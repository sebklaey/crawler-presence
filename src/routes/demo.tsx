import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHead } from "@/components/app-shell";
import demoVideo from "@/assets/crawler-demo.mp4.asset.json";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Crawler demo — see a Presence being built" },
      {
        name: "description",
        content:
          "Watch a full walkthrough of Crawler: the adaptive interview, the Knowledge Core, generated AI-readable files and the publish flow. No account needed.",
      },
      { property: "og:title", content: "Crawler demo — see a Presence being built" },
      {
        property: "og:description",
        content: "A full walkthrough of the Crawler interview, Knowledge Core and publish flow.",
      },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DemoPage,
});

function DemoPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="Walkthrough"
          title="See Crawler in action"
          description="A recorded walkthrough: describe what you do, let the adaptive interview fill the gaps, review the Knowledge Core and publish an AI-readable Presence."
        />

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <video
            src={demoVideo.url}
            controls
            playsInline
            preload="metadata"
            className="block h-auto w-full bg-secondary"
          >
            Your browser cannot play this video.
          </video>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <section>
            <h2 className="text-sm font-medium">Adaptive interview</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              No fixed questionnaire — Crawler infers what you are and asks only what is missing.
            </p>
          </section>
          <section>
            <h2 className="text-sm font-medium">One Knowledge Core</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Verified facts stay separate from positioning. Every generated file comes from the same source.
            </p>
          </section>
          <section>
            <h2 className="text-sm font-medium">Publish when ready</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Creation and preview are free. You only pay to be online — and there is still no account.
            </p>
          </section>
        </div>

        <div className="mt-10 flex flex-wrap gap-3 text-sm">
          <Link
            to="/"
            className="rounded-md border border-foreground px-4 py-2 hover:bg-secondary"
          >
            Tell Crawler what you do
          </Link>
          <Link to="/pricing" className="rounded-md border border-border px-4 py-2 hover:bg-secondary">
            See pricing
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHead } from "@/components/app-shell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Notice — Crawler" },
      {
        name: "description",
        content:
          "How SEBKLAEY collects, uses and protects data in Crawler: accountless sessions, minimized analytics, retention and your rights.",
      },
      { property: "og:title", content: "Privacy Notice — Crawler" },
      { property: "og:description", content: "Data minimisation, accountless sessions and your rights in Crawler." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="Legal"
          title="Privacy Notice"
          description="Last updated: 12 August 2026. Crawler is designed to collect as little personal data as possible."
        />
        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">1. Who we are</h2>
            <p>
              Crawler is operated by <strong className="text-foreground">SEBKLAEY</strong>, which acts as the data
              controller for personal data processed through the Crawler website and MCP connector. Contact:{" "}
              <a className="underline" href="mailto:support@crawler.today">support@crawler.today</a>.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">2. No accounts, no login</h2>
            <p>
              Crawler has no user registration, no login and no user profiles. Drafts are tied to an opaque,
              randomly generated session token; a published Presence is controlled by a recovery code of which we
              store only a cryptographic hash. We never receive your ChatGPT identity or your conversations with
              ChatGPT, Claude, Gemini or any other assistant.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">3. What we process and why</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>
                <span className="text-foreground">Content you provide</span> — interview answers, business/product
                descriptions, links and any contact details you choose to publish. Purpose: building your Knowledge
                Core and generating your Presence. Legal basis: performance of a contract.
              </li>
              <li>
                <span className="text-foreground">Session and ownership data</span> — opaque session token, hashed
                recovery code, Presence slug and status. Purpose: letting you return to a draft and prove ownership.
                Legal basis: performance of a contract.
              </li>
              <li>
                <span className="text-foreground">Minimized analytics events</span> — Presence slug, a constrained
                event type, timestamp, source class, optional generated-file path and an unlinkable hashed session
                fingerprint. Purpose: showing measurable Presence activity. Legal basis: legitimate interests in
                providing and improving the product. We do not store raw prompts, answers, IP addresses, user agents
                or full URLs with query strings.
              </li>
              <li>
                <span className="text-foreground">Support messages</span> — the email address and content you send
                us. Purpose: answering you. Legal basis: legitimate interests.
              </li>
              <li>
                <span className="text-foreground">Security and abuse signals</span> — rate-limit counters. Purpose:
                fraud and abuse prevention. Legal basis: legitimate interests and legal obligation.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">4. Published content is public</h2>
            <p>
              Anything you publish to a Presence (files under /p/…) is intentionally public and readable by people,
              search engines and AI crawlers. Do not publish personal data you do not want to be public.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">5. Who we share data with</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Hosting and database providers that run the service on our behalf;</li>
              <li>AI model providers that process interview text to generate your Presence content;</li>
              <li>
                Paddle.com, our Merchant of Record, for the sale of subscriptions, subscription management, payments,
                tax compliance and invoicing;
              </li>
              <li>Professional advisers (legal, accounting) where necessary;</li>
              <li>Authorities where we are legally required to disclose.</li>
            </ul>
            <p className="mt-3">We do not sell personal data and do not use it for third-party advertising.</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">6. Retention</h2>
            <p>
              Anonymous draft sessions expire after 30 days. Minimized analytics events are retained for a maximum of
              13 months and then deleted. Published Presence content is retained while the Presence exists and is
              deleted or anonymised after it is taken offline and no longer needed. Billing records held by Paddle
              follow their own statutory retention periods.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">7. International transfers</h2>
            <p>
              Our providers may process data outside Switzerland and the EEA. Where that happens we rely on adequacy
              decisions or EU Standard Contractual Clauses with appropriate supplementary safeguards.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">8. Your rights</h2>
            <p>
              Depending on where you live you have the right to access, rectify, erase, restrict or port your data,
              to object to processing based on legitimate interests, and to withdraw consent. You can also lodge a
              complaint with your supervisory authority (in Switzerland, the FDPIC). Write to{" "}
              <a className="underline" href="mailto:support@crawler.today">support@crawler.today</a> — we respond
              within one month. Because Crawler is accountless, we may need your recovery code or Presence slug to
              locate the relevant data.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">9. Security</h2>
            <p>
              We apply appropriate technical and organisational measures: encryption in transit, hashed recovery
              codes, backend-only database access with row-level security, rate limiting and least-privilege grants.
              No system is perfectly secure, but we design for minimal data exposure.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">10. Cookies and local storage</h2>
            <p>
              Crawler uses only essential browser storage to keep your current draft session and pending checkout
              state on your device. We set no advertising or third-party tracking cookies. You can clear this storage
              in your browser at any time, which ends your local draft session.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">11. Related</h2>
            <p>
              See our <Link className="underline" to="/terms">Terms &amp; Conditions</Link> and{" "}
              <Link className="underline" to="/refunds">Refund Policy</Link>.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

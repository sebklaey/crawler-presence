import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHead } from "@/components/app-shell";
import { RETENTION_CATALOG } from "@/lib/retention-catalog";

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
              Crawler has no user registration and no login. Public profiles in Crawler Room are optional. Drafts are
              tied to an opaque, randomly generated session token; a published Presence is controlled by a separate
              recovery code. Session tokens, room tokens and recovery codes are three distinct capabilities with
              different scopes, and we store only a one-way cryptographic hash of each — never the raw value. A
              session token can never be used as a recovery code. We never receive your ChatGPT identity or your conversations with
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
            <h2 className="mb-2 text-base font-medium text-foreground">3a. Crawler Love (optional, Pro and Business)</h2>
            <p>
              Crawler Love is entirely voluntary and only starts after you give explicit consent inside the Love
              interview. It is separate from your general Crawler profile and has its own data:
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>
                <span className="text-foreground">Love interview answers</span> — the free-text and choice answers
                you give in the guided interview. They are encrypted at rest, never shown to other users, never
                published and never sent to another person.
              </li>
              <li>
                <span className="text-foreground">Love Resonance Profile</span> — a derived, protected compatibility
                vector plus the short public-facing summary you approve. Only the summary and your handle can ever
                be shown to a potential match.
              </li>
              <li>
                <span className="text-foreground">Match state</span> — pending, accepted or declined requests, an
                expiry timestamp and a block list. Internal compatibility scores stay server-side and are never
                disclosed to any user.
              </li>
            </ul>
            <p className="mt-3">
              Matching runs entirely server-side. Nobody sees your raw answers, your vector or your score. You can
              pause, edit or delete your Love Profile at any time; deletion removes the answers, the vector and the
              open match requests. Unanswered Love interview drafts and expired match requests are cleaned up
              automatically. Crawler Love is for adults aged 18 and over. A mutual acceptance opens a publicly
              readable Pair Room — messages posted there are public, follow the standard 24-hour room retention and
              should never contain addresses, financial details, passwords or recovery codes.
            </p>
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
              There is no blanket “everything is deleted after 24 hours” rule. Different data classes have different
              lifetimes, and the table below mirrors what the service actually does:
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-foreground">
                    <th className="py-2 pr-4 font-medium">Data</th>
                    <th className="py-2 pr-4 font-medium">Retention</th>
                    <th className="py-2 font-medium">Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {RETENTION_CATALOG.map((entry) => (
                    <tr key={entry.data} className="border-b border-border/60 align-top">
                      <td className="py-2 pr-4 text-foreground">{entry.data}</td>
                      <td className="py-2 pr-4">{entry.retention}</td>
                      <td className="py-2">{entry.basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

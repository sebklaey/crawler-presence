import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHead } from "@/components/app-shell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Crawler" },
      {
        name: "description",
        content:
          "The terms that govern your use of Crawler, operated by SEBKLAEY, including payment, misuse, IP and termination.",
      },
      { property: "og:title", content: "Terms & Conditions — Crawler" },
      { property: "og:description", content: "Terms governing use of Crawler by SEBKLAEY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="Legal"
          title="Terms & Conditions"
          description="Last updated: 12 August 2026. These terms apply to everyone using Crawler."
        />
        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">1. Who you are contracting with</h2>
            <p>
              Crawler is operated by <strong className="text-foreground">SEBKLAEY</strong> ("we", "us", the
              "Seller"). By using Crawler, whether through the website or through the ChatGPT MCP connector, you
              enter into an agreement with SEBKLAEY. Questions can be sent to{" "}
              <a className="underline" href="mailto:support@crawler.today">support@crawler.today</a>.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">2. Acceptance</h2>
            <p>
              By continuing to use Crawler you agree to these terms. If you use Crawler on behalf of an
              organisation, you confirm that you are authorised to bind it. If you use it as an individual, you
              confirm that you are of legal age in your country.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">3. What Crawler provides</h2>
            <p>
              Crawler turns an adaptive interview into a structured Knowledge Core and generates AI-readable files
              (llms.txt, markdown pages, JSON endpoints) for a public Presence. Creating and previewing a Presence
              is free; hosting a published Presence is a paid subscription (Plus, Pro or Business).
            </p>
            <p className="mt-3">
              <strong className="text-foreground">Crawler is a purely digital software service.</strong> Everything we
              sell is a monthly software subscription delivered electronically and available immediately after
              purchase. We do not sell, resell, ship, deliver, fulfil, warehouse or dropship any physical goods,
              hardware or printed material, and no physical item is ever included with, bundled into or dispatched as
              part of a subscription. There is no shipping, no delivery address and no postage at any point.
            </p>
            <p className="mt-3">
              Some Presences describe their owner's own catalogue — for example a studio's services or a company's
              product range. Those descriptions are text written by the Presence owner and published as AI-readable
              files. Crawler never sells, brokers, processes orders for or takes payment for anything a Presence
              describes; the only transaction on this site is the Crawler subscription itself.
            </p>
          </section>


          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">4. Accountless ownership</h2>
            <p>
              Crawler has no user accounts and no login. Ownership of a published Presence is controlled entirely by
              the recovery code shown once at publication. You are responsible for storing it securely. If you lose
              it, the Presence cannot be recovered, transferred or taken offline by us on your behalf.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">5. Acceptable use</h2>
            <p>You must not use Crawler to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>break any applicable law, or publish unlawful, deceptive or infringing content;</li>
              <li>commit fraud, send spam, or impersonate a person, brand or business you do not represent;</li>
              <li>infringe intellectual property or publish content you do not have the rights to;</li>
              <li>
                interfere with the security of the service — no malware, probing, penetration attempts, automated
                scraping or circumvention of rate limits and plan limits;
              </li>
              <li>reverse engineer, resell or redistribute the service.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">6. AI-generated content</h2>
            <p>
              Crawler uses AI models to conduct the interview and to draft Presence content. Outputs can be
              inaccurate or incomplete and are not professional, legal, financial, medical or tax advice. You are
              responsible for the information you provide, for verifying every published claim, and for holding the
              rights to any content, links or product data you submit. We may filter, restrict or remove content,
              refuse outputs, or take a Presence offline where content appears unlawful or infringing. Rights holders
              can request a takedown at{" "}
              <a className="underline" href="mailto:support@crawler.today">support@crawler.today</a>; repeated or
              serious infringement leads to termination.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">7. Intellectual property</h2>
            <p>
              SEBKLAEY retains all rights in Crawler itself — software, generation logic, documentation and branding.
              You keep ownership of the content you supply and grant us a limited licence to host and process it
              solely to operate and publish your Presence. Subscriptions grant a limited, non-exclusive,
              non-transferable right to use Crawler within the selected plan.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">8. Service level</h2>
            <p>
              Crawler is provided on an "as is" and "as available" basis. We do not guarantee uninterrupted or
              error-free operation, and to the fullest extent permitted by law we disclaim implied warranties of
              merchantability and fitness for a particular purpose.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">9. Payment, billing and subscriptions</h2>
            <p>
              Subscriptions are billed monthly in advance at the prices shown on the{" "}
              <Link className="underline" to="/pricing">pricing page</Link> and renew automatically until cancelled.
            </p>
            <p className="mt-3">
              Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record
              for all our orders. Paddle provides all customer service inquiries and handles returns.
            </p>
            <p className="mt-3">
              Payment, billing, tax, cancellation and refund mechanics are governed by{" "}
              <a
                className="underline"
                href="https://www.paddle.com/legal/checkout-buyer-terms"
                target="_blank"
                rel="noreferrer"
              >
                Paddle's Buyer Terms
              </a>
              . See also our <Link className="underline" to="/refunds">refund policy</Link>.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">10. Suspension and termination</h2>
            <p>
              We may suspend or terminate access to a Presence for material breach of these terms, non-payment,
              security or fraud risk, or repeated policy violations. When a subscription ends, the published Presence
              is taken offline; generated files and Knowledge Core data may be deleted after a reasonable period.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">11. Liability</h2>
            <p>
              To the fullest extent permitted by law, our aggregate liability is limited to the fees you paid in the
              12 months before the claim. We exclude liability for indirect, consequential or special damages,
              including loss of profits, data or goodwill. Nothing excludes liability for fraud, death or personal
              injury where the law does not allow it. You indemnify us against claims arising from your content,
              unlawful use, or breach of these terms.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">12. Changes, law and disputes</h2>
            <p>
              We may update these terms; continued use after an update means acceptance. You may not assign your
              rights without our consent; we may assign in connection with a merger or acquisition. Neither party is
              liable for delays caused by events beyond reasonable control. These terms are governed by Swiss law and
              disputes are subject to the courts of Switzerland, unless mandatory consumer law in your country
              provides otherwise.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

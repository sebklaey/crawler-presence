import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHead } from "@/components/app-shell";

export const Route = createFileRoute("/refunds")({
  head: () => ({
    meta: [
      { title: "Refund Policy — Crawler" },
      {
        name: "description",
        content:
          "Crawler offers a 30-day money-back guarantee on hosting subscriptions. Refunds are handled by Paddle, our Merchant of Record.",
      },
      { property: "og:title", content: "Refund Policy — Crawler" },
      { property: "og:description", content: "30-day money-back guarantee on Crawler hosting subscriptions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RefundsPage,
});

function RefundsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="Legal"
          title="Refund Policy"
          description="Last updated: 12 August 2026. Applies to all Crawler hosting subscriptions sold by SEBKLAEY."
        />
        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">30-day money-back guarantee</h2>
            <p>
              If you are not satisfied with your Crawler subscription, you can request a full refund within 30 days
              of your order date. Building a Knowledge Core and previewing every generated file is always free, so
              you only ever pay for hosting a published Presence.
            </p>
            <p className="mt-3">
               Crawler sells access to digital SaaS and online Presence hosting only. The service is activated
               electronically. No physical product, merchandise, hardware or printed material is included, shipped or
               returned, so there are no return shipments, restocking fees or postage costs.
            </p>
          </section>


          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">How to request a refund</h2>
            <p>
              Payments are processed by our reseller and Merchant of Record, Paddle.com. To request a refund, visit{" "}
              <a className="underline" href="https://paddle.net" target="_blank" rel="noreferrer">
                paddle.net
              </a>{" "}
              with the email address used at checkout, or contact us at{" "}
              <a className="underline" href="mailto:support@crawler.today">support@crawler.today</a> and we will
              arrange it with Paddle. Approved refunds are returned to the original payment method, usually within
              5–10 business days depending on your bank.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">Cancellations and renewals</h2>
            <p>
              Subscriptions renew monthly. You can cancel at any time through the Paddle billing portal linked from
              your Presence management page; cancellation stops future renewals and your published Presence stays
              online until the end of the paid period. Beyond the 30-day window, renewal charges are generally not
              refundable, but if a renewal caught you by surprise, contact us — we look at these case by case.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">Related</h2>
            <p>
              See our <Link className="underline" to="/terms">Terms &amp; Conditions</Link>,{" "}
              <Link className="underline" to="/privacy">Privacy Notice</Link> and{" "}
              <a
                className="underline"
                href="https://www.paddle.com/legal/refund-policy"
                target="_blank"
                rel="noreferrer"
              >
                Paddle's refund policy
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

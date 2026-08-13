import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { AppShell, PageHead } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitSupportFn } from "@/lib/support.functions";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — Crawler" },
      {
        name: "description",
        content:
          "Get help with your Crawler Presence: publishing, recovery codes, custom domains, team access and billing. Written answers from a real person.",
      },
      { property: "og:title", content: "Support — Crawler" },
      { property: "og:description", content: "Ask about publishing, recovery codes, domains, team access or billing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportPage,
});

const SUPPORT_EMAIL = "sebklay@me.com";

function SupportPage() {
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = useServerFn(submitSupportFn);

  async function send() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await submit({ data: { email, subject, message, ...(slug.trim() ? { slug: slug.trim() } : {}) } });
      if (!result.ok) {
        toast.error(
          result.reason === "invalid-email"
            ? "Please enter a valid email address."
            : result.reason === "not-recorded"
              ? `Your request could not be recorded, so nothing was sent. Please try again or email ${SUPPORT_EMAIL} directly.`
              : "Too many requests right now — please try again in a minute.",
        );
        return;
      }
      setSent(true);
      setMessage("");
      toast.success(
        result.delivered
          ? "Sent. You'll get a reply at the address you gave."
          : "Received. Your request is recorded and will be answered by email.",
      );
    } catch {
      toast.error("Could not send that right now.");
    } finally {
      setBusy(false);
    }
  }

  const valid = email.trim().length > 4 && subject.trim().length > 2 && message.trim().length > 9;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="Help"
          title="Support"
          description="Crawler has no accounts, so support works by email. Write below or reach us directly — we answer in writing, usually within one working day."
        />

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <a className="underline underline-offset-4" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Business plan includes priority support. Never send your recovery code — support never needs it, and nobody
            can recover it for you.
          </p>
        </div>

        <div className="mt-4 space-y-4 rounded-2xl border border-border bg-card p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="support-email">
                Your email
              </label>
              <Input
                id="support-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1.5 h-10"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="support-slug">
                Presence slug (optional)
              </label>
              <Input
                id="support-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="your-presence"
                className="mt-1.5 h-10"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground" htmlFor="support-subject">
              Subject
            </label>
            <Input
              id="support-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Custom domain will not verify"
              className="mt-1.5 h-10"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground" htmlFor="support-message">
              How can we help?
            </label>
            <Textarea
              id="support-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe what you tried and what happened."
              className="mt-1.5 min-h-40"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void send()} disabled={busy || !valid}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send request
            </Button>
            {sent ? <span className="text-xs text-muted-foreground">Request recorded.</span> : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

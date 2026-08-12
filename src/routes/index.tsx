import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { PresenceStatus } from "@/components/presence-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { interviewTurn } from "@/lib/interview.functions";
import { emptyCore, isCoreEmpty, type KnowledgeCore } from "@/lib/knowledge";
import { uid, useChat, useCore, type ChatMessage } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Crawler — Tell Crawler what you do" },
      {
        name: "description",
        content:
          "Crawler turns what you do into an AI-readable public presence: llms.txt, markdown pages and JSON endpoints, built through an adaptive interview.",
      },
      { property: "og:title", content: "Crawler — Tell Crawler what you do" },
      {
        property: "og:description",
        content: "Build an AI-readable presence through an adaptive interview. Creation and preview are free.",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Crawler",
          url: "https://crawler.today",
          description:
            "Crawler turns what you do into an AI-readable public presence: llms.txt, markdown pages and JSON endpoints.",
        }),
      },
    ],
  }),

  component: Index,
});

const EXAMPLES = [
  "I'm a documentary photographer in Lisbon shooting for magazines.",
  "We're a two-person design studio doing brand and web work.",
  "https://example-analytics.com — we build a privacy-first analytics tool.",
  "I run an open-source project for local-first sync.",
];


function Index() {
  const [core, setCore] = useCore();
  const [messages, setMessages] = useChat();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const turn = useServerFn(interviewTurn);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const started = messages.length > 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, [busy, started]);

  useEffect(() => {
    if (started) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, started]);

  async function send(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    setInput("");
    const userMsg: ChatMessage = { id: uid(), role: "user", content: value };
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);
    try {
      const res = await turn({ data: { message: value, history, core: isCoreEmpty(core) ? undefined : core } });
      setCore(mergeCore(res.core as never));
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: `${res.reply}\n\n${res.question}`,
          suggestions: res.suggestions ?? [],
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      toast.error(msg.includes("429") ? "Rate limit reached — try again shortly." : "Crawler could not answer. Try again.");
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setInput(value);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-16">
        {!started ? (
          <div className="fade-up">
            <h1 className="display text-5xl sm:text-6xl">Tell Crawler what you do.</h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              Describe your work in your own words, or paste a website link. Crawler works out what
              kind of entity you are and asks the questions that matter for it — then builds one structured
              Knowledge Core that AI systems can read.
            </p>
            <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-muted-foreground/80">
              Crawler is a software subscription. We host AI-readable text files for your public Presence. We do not
              sell, ship or fulfil any physical goods, and nothing is ever posted to you.
            </p>

          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((m) => (
              <div key={m.id} className="fade-up">
                {m.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div className="max-w-[92%]">
                    <div className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Crawler
                    </div>
                    <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{m.content}</div>
                    {m.suggestions?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {m.suggestions.map((s) => (
                          <button
                            key={s}
                            onClick={() => send(s)}
                            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
            {busy ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking about what to ask next…
              </div>
            ) : null}
            <div ref={endRef} />
          </div>
        )}

        <div className="sticky bottom-6 mt-10">
          <div className="rounded-2xl border border-border bg-card p-2 shadow-[0_1px_0_0_oklch(0_0_0/4%),0_18px_40px_-28px_oklch(0_0_0/35%)]">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={started ? 2 : 3}
              placeholder={started ? "Answer, correct, or add detail…" : "What do you do? Or paste a link…"}
              className="min-h-0 resize-none border-0 bg-transparent px-3 py-2 text-[15px] shadow-none focus-visible:ring-0"
            />
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="text-[11px] text-muted-foreground">No fixed questionnaire. One question at a time.</span>
              <Button size="sm" disabled={busy || !input.trim()} onClick={() => void send(input)}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        {!started ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                onClick={() => send(e)}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                {e}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-12">
            <PresenceStatus core={core} />
          </div>
        )}

        {started ? (
          <button
            onClick={() => {
              setMessages([]);
              setCore(emptyCore());
            }}
            className="mt-8 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Start a new presence
          </button>
        ) : null}
      </div>
    </AppShell>
  );
}

/** The model returns the core without ids — attach stable ids and a timestamp. */
function mergeCore(next: Omit<KnowledgeCore, "facts" | "stories" | "items" | "faqs" | "cv" | "updatedAt"> & {
  facts: { label: string; value: string; status: "verified" | "claimed"; source?: string }[];
  stories: { label: string; text: string; confirmed: boolean }[];
  items: KnowledgeCore["items"];
  faqs: { question: string; answer: string }[];
  cv: Omit<KnowledgeCore["cv"][number], "id">[];
}): KnowledgeCore {
  return {
    ...next,
    facts: next.facts.map((f) => ({ ...f, id: uid() })),
    stories: next.stories.map((s) => ({ ...s, id: uid() })),
    items: next.items.map((i) => ({ ...i, id: uid() })),
    faqs: next.faqs.map((f) => ({ ...f, id: uid() })),
    cv: next.cv.map((e) => ({ ...e, id: uid() })),
    updatedAt: new Date().toISOString(),
  };
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { AppShell, PageHead } from "@/components/app-shell";

export const Route = createFileRoute("/room")({
  head: () => ({
    meta: [
      { title: "Small, anonymous rooms for one topic in ChatGPT" },
      {
        name: "description",
        content:
          "@crawler connects you anonymously with up to four other people in small topic rooms — right inside ChatGPT.",
      },
      { property: "og:title", content: "Small, anonymous rooms for one topic in ChatGPT" },
      {
        property: "og:description",
        content:
          "Small rooms with at most five people, pseudonymous, no account, 24-hour retention.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RoomPage,
});

interface Health {
  status: string;
  version?: string;
  database?: string;
}

const TOPIC_HINTS = ["AI", "Art", "Science", "Tech", "Music", "Gaming", "Life"];

const EXTENSIONS = [
  {
    name: "Rooms",
    plan: null,
    price: "Free",
    features: [
      "Universal Room and topic rooms",
      "Public profiles",
      "Text and reviewed images",
      "Post social media profiles",
      "Follow, likes and public interaction",
      "Crawler Sugar: mine, gift and show reputation",
    ],
  },
  {
    name: "Your own rooms",
    plan: "plus" as const,
    price: "Plus · $5/month",
    features: [
      "Your personal public room",
      "Additional public rooms",
      "Invitation links",
      "Profile and room analytics",
      "Room management",
    ],
  },
  {
    name: "Communities & Match",
    plan: "pro" as const,
    price: "Pro · $20/month",
    features: [
      "Everything in Plus",
      "Crawler Match with anonymous resonance patterns",
      "Mutual consent before any connection",
      "Public Pair Rooms",
      "Community rooms, moderators and higher limits",
      "Crawler Love — guided romantic compatibility",
    ],
  },

  {
    name: "Organisations",
    plan: "business" as const,
    price: "Business · $80/month",
    features: [
      "Organisations and larger communities",
      "Team management",
      "Crawler Ads — resonance-based sponsored cards",
      "Sponsored campaigns",
      "Campaign analytics (aggregated only)",
      "REST API and scheduled reports",
      "Everything in Pro, including Crawler Love",
    ],
  },

] as const;


const STEPS = [
  {
    title: "Pick a topic",
    body: "Type “@crawler AI” in ChatGPT. @crawler places you in a room with at most five people.",
  },
  {
    title: "Write",
    body: "“@crawler AI: What are you working on right now?” — your message lands in the room anonymously.",
  },
  {
    title: "Share a picture",
    body: "Send an image in your room. It stays private until it passes a safety review — only then does the room see it.",
  },
  {
    title: "Your own room",
    body: "Say “@crawlers my room”. Everyone gets one permanent public room named after them — no login. Others follow it with “@crawlers follow @you”.",
  },
  {
    title: "Catch up",
    body: "Just type “@crawler”. New messages appear when you ask; there are no push notifications.",
  },
];

const PRIVACY = [
  "No account, no sign-up, no profiles.",
  "Every room is public: there are no private rooms and no private messages in Crawler Room.",
  "Match stores only abstract resonance dimensions — no profile texts, no chat history.",
  "Your ChatGPT identifier is only stored as a hash — never in plain text.",

  "Temporary room: only the newest 7 text messages and 3 images per room are kept — older content is deleted automatically and permanently.",
  "Messages are deleted automatically after 24 hours.",
  "Images are stored privately, stripped of EXIF/GPS data and never published before a safety review approves them.",
  "You only see messages posted in your room after you joined.",
  "Every message and image can be reported; rooms stay small and manageable.",
];

function RoomPage() {
  const { data, isLoading } = useQuery<Health>({
    queryKey: ["room-health"],
    queryFn: async () => {
      const response = await fetch("/api/public/room-health");
      return (await response.json()) as Health;
    },
    retry: false,
  });

  const online = data?.status === "ok";


  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-6 pb-24">
        <section className="py-14 sm:py-20">
          <PageHead
            eyebrow="@crawler"
            title="Small, anonymous rooms for one topic in ChatGPT."
            description="@crawler is a ChatGPT plugin: pick a topic, land anonymously in a room with at most five people and talk there — no account, no profile, no history."
          />

          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className={`h-2 w-2 rounded-full ${
                isLoading ? "bg-muted-foreground" : online ? "bg-chart-2" : "bg-destructive"
              }`}
              aria-hidden
            />
            {isLoading ? "Checking service status" : online ? "Service online" : "Service disrupted"}
          </div>

          <div className="mt-8 rounded-xl border border-border bg-card p-5 font-mono text-sm text-card-foreground">
            <p className="text-muted-foreground">In ChatGPT:</p>
            <p className="mt-2">@crawler AI</p>
            <p>@crawler AI: What are you working on right now?</p>
            <p>@crawler</p>
          </div>
        </section>

        <section className="grid gap-6 border-t border-border py-14 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title}>
              <span className="text-sm font-medium text-muted-foreground">0{index + 1}</span>
              <h2 className="mt-2 text-lg font-semibold">{step.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </section>

        <section className="border-t border-border py-14">
          <h2 className="text-2xl font-semibold tracking-tight">Topics</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Synonyms are recognised — “AI”, “KI” and “artificial intelligence” all lead to the same
            topic.
          </p>

          <ul className="mt-6 flex flex-wrap gap-2">
            {TOPIC_HINTS.map((topic) => (
              <li
                key={topic}
                className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground"
              >
                {topic}
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-border py-14">
          <h2 className="text-2xl font-semibold tracking-tight">Extensions</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Joining rooms stays free. The room extensions are tied to the Crawler subscriptions:
            Plus unlocks your own room, Pro adds Match and communities, Business adds organisations.
          </p>
          <p className="mt-3 rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm font-medium text-foreground">
            All Crawler rooms are publicly readable. Crawler has no private rooms and no private messages.
          </p>
          <div className="mt-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Crawler Sugar — free on every plan</p>
            <p className="mt-1">
              Sugar is an internal appreciation signal. Active use mines it slowly, gifts move in steps of
              ten, the recipient keeps 30 % and 70 % is burned forever. Balance and “minted all time” show
              on public profiles. Sugar has no monetary value, is not a cryptocurrency and cannot be bought,
              sold, withdrawn or exchanged.
            </p>
          </div>


          <div className="mt-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Crawler Love — Pro and Business</p>
            <p className="mt-1">
              Find romantic resonance through a guided compatibility interview. Crawler Love is fully
              optional and separate from your general Crawler profile: its own consent, its own interview,
              its own protected Love Profile and its own matching pool. Start the interview in ChatGPT
              (“@Crawler Love”), review the summary, then activate, pause, edit or delete it at any time.
              Crawler suggests at most one compatible person, sends nothing without your explicit
              confirmation, and only a mutual acceptance opens a publicly readable Pair Room in which only
              the two of you can post. Crawler Love is for adults aged 18 and over — never share addresses,
              financial details, passwords or recovery codes. It does not guarantee attraction, a
              relationship or a perfect partner.
            </p>
            <p className="mt-2">
              On Free and Plus: Crawler Love is available with Crawler Pro and Business.{" "}
              <Link to="/pricing" className="underline underline-offset-4 hover:text-foreground">
                View plans
              </Link>
              .
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {EXTENSIONS.map((extension) => (
              <div key={extension.name} className="flex flex-col rounded-lg border border-border bg-card p-5">
                <h3 className="text-lg font-semibold">{extension.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{extension.price}</p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
                  {extension.features.map((feature) => (
                    <li key={feature}>· {feature}</li>
                  ))}
                </ul>
                {extension.plan ? (
                  <Link
                    to="/publish"
                    search={{ plan: extension.plan }}
                    className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Buy {extension.name}
                  </Link>
                ) : (
                  <span className="mt-5 inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground">
                    Included for everyone
                  </span>
                )}
              </div>
            ))}
          </div>

          <p className="mt-6 text-sm text-muted-foreground">
            Full plan details are on the{" "}
            <Link to="/pricing" className="underline underline-offset-4">
              pricing page
            </Link>
            . Ask ChatGPT “show my @crawler options” to see what is unlocked. Sponsored rooms are always
            labelled as advertising, reviewed before publication, and can be hidden at any time.
          </p>
        </section>

        <section className="border-t border-border py-14">
          <h2 className="text-2xl font-semibold tracking-tight">Privacy</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {PRIVACY.map((item) => (
              <li key={item} className="rounded-lg border border-border bg-card p-4 text-sm">
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-muted-foreground">
            Messages from other people are third-party content. Never share personal data there.
          </p>
        </section>
      </main>
    </AppShell>
  );
}

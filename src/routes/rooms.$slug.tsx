import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { RoomMessageBody } from "@/components/social-profile-card";
import { getPairRoomFn } from "@/lib/pairroom.functions";

export const Route = createFileRoute("/rooms/$slug")({
  loader: ({ params }) => getPairRoomFn({ data: { slug: params.slug } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: "Public Match Room — Crawler Room" },
      {
        name: "description",
        content:
          "A public two-person room in Crawler Room. Everyone can read this conversation; only the two matched handles can post.",
      },
      { property: "og:title", content: "Public Match Room — Crawler Room" },
      {
        property: "og:description",
        content: loaderData?.found
          ? `Public conversation between ${loaderData.participants.map((h) => `@${h}`).join(" and ")}.`
          : "This public match room is not available.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: () => (
    <AppShell>
      <div className="mx-auto max-w-3xl px-5 py-20 text-sm text-muted-foreground">
        This room could not be loaded.
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="mx-auto max-w-3xl px-5 py-20 text-sm text-muted-foreground">Room not found.</div>
    </AppShell>
  ),
  component: PairRoomPage,
});

function PairRoomPage() {
  const data = Route.useLoaderData();

  if (!data?.found) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-5 py-20">
          <h1 className="display text-3xl">Room not found</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This public match room does not exist or has expired.{" "}
            <Link to="/room" className="underline underline-offset-4">
              About Crawler Room
            </Link>
            .
          </p>
        </div>
      </AppShell>
    );
  }

  const handles = data.participants.map((handle) => `@${handle}`);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-5 py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Public Match Room</p>
        <h1 className="display mt-3 text-3xl">{handles.join(" · ")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Everyone can read this conversation. Only {handles.join(" and ")} can post. Messages disappear
          after 24 hours.
        </p>

        <div className="mt-10 space-y-4">
          {data.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            data.messages.map((message, index) => (
              <div key={`${message.created_at}-${index}`} className="rounded-lg border border-border p-4">
                <div className="text-xs text-muted-foreground">
                  @{message.handle} · {new Date(message.created_at).toLocaleString()}
                </div>
                <RoomMessageBody body={message.body} />
              </div>
            ))
          )}
        </div>

        <p className="mt-12 text-xs text-muted-foreground">
          Crawler Room has no private rooms and no private messages — every room is publicly readable.
        </p>
      </div>
    </AppShell>
  );
}

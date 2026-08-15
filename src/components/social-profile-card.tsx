/**
 * Renders a posted social profile as a compact, clickable card in the web UI.
 * Falls back to plain text for every non-social message.
 */
import { parseSocialBody } from "@/lib/room/social/card";

export function RoomMessageBody({ body }: { body: string }) {
  const card = parseSocialBody(body);
  if (!card) return <p className="mt-2 text-sm leading-relaxed">{body}</p>;

  return (
    <a
      href={card.url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className="mt-2 block rounded-xl border border-border p-3 transition-colors hover:bg-muted/50"
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{card.headline}</div>
      <div className="mt-1 text-sm font-medium">{card.title}</div>
      <div className="mt-1 break-all text-xs text-muted-foreground">{card.url}</div>
    </a>
  );
}

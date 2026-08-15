import { createServerFn } from "@tanstack/react-start";

/** Public read of a Public Match Room. No identity, no plan, no account. */
export const getPairRoomFn = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => ({ slug: String(input.slug).slice(0, 64) }))
  .handler(async ({ data }) => {
    const { getDb } = await import("@/lib/room/store");
    const { loadPairRoom, listParticipants, readPairMessages } = await import(
      "@/lib/room/match/pairrooms"
    );

    const db = await getDb();
    const room = await loadPairRoom(db, data.slug);
    if (!room) return { found: false as const };

    const [participants, messages] = await Promise.all([
      listParticipants(db, room.id),
      readPairMessages(db, room.id),
    ]);

    return {
      found: true as const,
      slug: room.public_slug,
      title: room.title,
      created_at: room.created_at,
      participants: participants.map((p) => p.public_handle),
      messages,
    };
  });

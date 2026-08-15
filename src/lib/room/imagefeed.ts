/**
 * Shared image feed serialization.
 *
 * Lives in its own module so both the topic-room tools and the Universal Room
 * feed can render approved images without a circular import.
 */
import { imageConfig, IMAGE_RETENTION } from "./config";
import { encodeImageId } from "./ids";
import {
  aliasesFor,
  listApprovedImages,
  listOwnUnpublishedImages,
  signedUrl,
  type ImageRow,
} from "./imagestore";
import type { Db } from "./store";

export interface ImageViewer {
  roomId: string;
  membershipId: string;
}

export async function serializeImages(db: Db, rows: ImageRow[], viewer: ImageViewer) {
  const aliases = await aliasesFor(db, rows.map((row) => row.sender_membership_id));
  const ttl = imageConfig().signedUrlTtlSeconds;
  return Promise.all(
    rows.map(async (row) => ({
      id: await encodeImageId(row.id),
      alias: aliases[row.sender_membership_id] ?? "Unbekannt",
      created_at: new Date(row.created_at).toISOString(),
      alt_text: row.alt_text ?? "",
      width: row.width ?? 0,
      height: row.height ?? 0,
      status: row.moderation_status,
      is_self: row.sender_membership_id === viewer.membershipId,
      url:
        row.moderation_status === "approved"
          ? ((await signedUrl(db, row.storage_path, ttl)) ?? "")
          : "",
      note:
        row.moderation_status === "approved"
          ? "Zeige dieses Bild sofort in der Antwort an (Markdown ![alt_text](url)); alternativ get_image mit dieser id."
          : row.moderation_status === "pending"
            ? "Bild wird geprüft … (nur für dich sichtbar)"
            : "Bild abgelehnt (nur für dich sichtbar).",
    })),
  );
}

/** Approved images of the room plus the caller's own pending/rejected uploads. */
export async function roomImages(db: Db, viewer: ImageViewer, limit = IMAGE_RETENTION) {
  const approved = await listApprovedImages(db, viewer.roomId, limit);
  const own = await listOwnUnpublishedImages(db, viewer.roomId, viewer.membershipId);
  return {
    images: await serializeImages(db, approved, viewer),
    my_pending_images: await serializeImages(db, own, viewer),
  };
}

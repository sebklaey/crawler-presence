/**
 * MCP tool descriptors for the social profile (view, edit, likes, analytics).
 * Registered alongside the core and personal-room tools in `mcp.ts`.
 */
import type { McpMeta } from "./identity";
import {
  handleBlockProfile,
  handleChangeHandle,
  handleGetProfile,
  handleLikeContent,
  handleProfileAnalytics,
  handleSetProfileImage,
  handleTrackProfileLink,
  handleUnlikeContent,
  handleUpdateProfile,
} from "./tools.profile";

type Json = Record<string, unknown>;

export interface ProfileToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  outputSchema: Json;
  annotations: Json;
  handler: (input: unknown, meta: McpMeta) => Promise<Json>;
  summary: (result: any) => string;
}

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
};
const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: true,
  idempotentHint: false,
};

const likeInput: Json = {
  type: "object",
  properties: {
    target_type: { type: "string", enum: ["profile", "message", "image"] },
    target_id: {
      type: "string",
      description:
        "Bei profile das Handle (mit oder ohne @), bei message/image die ID aus der Raum- oder Profilausgabe.",
    },
  },
  required: ["target_type", "target_id"],
  additionalProperties: false,
};

/* ------------------------- shared output fragments ------------------------ */

/** Message list entry as returned by `profileMessages` in tools.profile.ts. */
const PROFILE_MESSAGE_ITEM: Json = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string" },
    alias: { type: "string" },
    text: { type: "string" },
    created_at: { type: "string" },
    is_owner: { type: "boolean" },
    likes: { type: "integer" },
    liked_by_me: { type: "boolean" },
  },
  required: ["id", "alias", "text", "created_at", "is_owner", "likes", "liked_by_me"],
};

/** Image list entry as returned by `profileImages` in tools.profile.ts. */
const PROFILE_IMAGE_ITEM: Json = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string" },
    alias: { type: "string" },
    alt_text: { type: "string" },
    created_at: { type: "string" },
    url: { type: "string" },
    likes: { type: "integer" },
    liked_by_me: { type: "boolean" },
  },
  required: ["id", "alias", "alt_text", "created_at", "url", "likes", "liked_by_me"],
};

/** Follower entry as returned by `listFollowers` in personal.ts. */
const PROFILE_FOLLOWER_ITEM: Json = {
  type: "object",
  additionalProperties: true,
  properties: {
    alias: { type: "string" },
    since: { type: "string" },
  },
  required: ["alias", "since"],
};

/** Followed-room entry as returned by `listFollowedRooms` in personal.ts. */
const PROFILE_FOLLOWING_ITEM: Json = {
  type: "object",
  additionalProperties: true,
  properties: {
    handle: { type: "string" },
    room_name: { type: "string" },
    description: { type: ["string", "null"] },
    followers: { type: "integer" },
    people_here_now: { type: "integer" },
    following_since: { type: "string" },
  },
  required: ["handle", "room_name", "description", "followers", "people_here_now", "following_since"],
};

/**
 * Full profile card as returned by `serializeProfile` (owner or public view of
 * an existing, non-private profile). `sugar_mining_*` fields are only present
 * when the viewer is the owner, so they stay out of `required`.
 */
const FULL_PROFILE_PROPS: Json = {
  handle: { type: "string" },
  display_name: { type: "string" },
  bio: { type: "string" },
  location: { type: "string" },
  external_url: { type: "string" },
  joined_at: { type: "string" },
  visibility: { type: "string", enum: ["public", "private"] },
  is_owner: { type: "boolean" },
  profile_image_url: { type: ["string", "null"] },
  banner_image_url: { type: ["string", "null"] },
  sugar_balance: { type: "number" },
  sugar_minted_all_time: { type: "number" },
  sugar_notice: { type: "string" },
  sugar_mining_status: { type: "string", description: "Nur für den Besitzer sichtbar." },
  sugar_mining_lease_expires_at: { type: ["string", "null"], description: "Nur für den Besitzer sichtbar." },
  sugar_minted_today: { type: "number", description: "Nur für den Besitzer sichtbar." },
  followers: { type: ["integer", "null"] },
  following: { type: "integer" },
  likes_received: { type: ["integer", "null"] },
  messages: { type: "integer" },
  images: { type: "integer" },
  people_here_now: { type: "integer" },
  online: { type: ["boolean", "null"] },
  presence_window_seconds: { type: "integer" },
  presence_checked_at: { type: "string" },
  liked_profile_by_me: { type: "boolean" },
  is_following: { type: "boolean" },
  headline: { type: "string" },
};

const FULL_PROFILE_REQUIRED = [
  "handle",
  "display_name",
  "bio",
  "location",
  "external_url",
  "joined_at",
  "visibility",
  "is_owner",
  "profile_image_url",
  "banner_image_url",
  "sugar_balance",
  "sugar_minted_all_time",
  "sugar_notice",
  "followers",
  "following",
  "likes_received",
  "messages",
  "images",
  "people_here_now",
  "online",
  "presence_window_seconds",
  "presence_checked_at",
  "liked_profile_by_me",
  "is_following",
  "headline",
];

const FULL_PROFILE_SCHEMA: Json = {
  type: "object",
  additionalProperties: true,
  properties: FULL_PROFILE_PROPS,
  required: FULL_PROFILE_REQUIRED,
};

/**
 * `get_profile`'s `profile` field: either the full card above, or — when the
 * profile is private and the viewer is not the owner — the minimal stub
 * returned early by `handleGetProfile`. Only the four fields common to both
 * branches are required.
 */
const GET_PROFILE_PROFILE_SCHEMA: Json = {
  type: "object",
  additionalProperties: true,
  properties: {
    ...FULL_PROFILE_PROPS,
  },
  required: ["handle", "display_name", "visibility", "is_owner"],
};

/** Daily analytics bucket: `day` plus a dynamic count per event type. */
const ANALYTICS_DAY_ITEM: Json = {
  type: "object",
  additionalProperties: true,
  properties: {
    day: { type: "string" },
  },
  required: ["day"],
};

const TOP_CONTENT_ITEM: Json = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string" },
    likes: { type: "integer" },
  },
  required: ["id", "likes"],
};

/** Renders a ready-to-display Markdown profile card (banner + avatar + metrics). */
function profileSummary(result: any): string {
  const p = result.profile ?? {};
  if (p.visibility === "private" && !p.is_owner) return String(result.message);

  const parts: string[] = [];

  if (p.banner_image_url) parts.push(`![Banner von @${p.handle}](${p.banner_image_url})`);
  if (p.profile_image_url) parts.push(`![Profilbild von @${p.handle}](${p.profile_image_url})`);

  parts.push(`## ${p.display_name}\n**@${p.handle}**`);
  if (p.bio) parts.push(`> ${String(p.bio).replace(/\n/g, "\n> ")}`);

  const meta = [
    p.location ? `📍 ${p.location}` : null,
    p.external_url ? `🔗 [${p.external_url}](${/^https?:\/\//.test(p.external_url) ? p.external_url : `https://${p.external_url}`})` : null,
    p.joined_at ? `📅 seit ${String(p.joined_at).slice(0, 10)}` : null,
  ].filter(Boolean);
  if (meta.length) parts.push(meta.join(" · "));

  const stats: Array<[string, unknown]> = [];
  if (p.followers !== null && p.followers !== undefined) stats.push(["Followers", p.followers]);
  stats.push(["Following", p.following ?? 0]);
  if (p.likes_received !== null && p.likes_received !== undefined) stats.push(["Likes", p.likes_received]);
  stats.push(["Jetzt hier", `🟢 ${p.people_here_now ?? 0}`]);
  stats.push(["🍬 Sugar", p.sugar_balance ?? 0]);
  parts.push(
    `| ${stats.map(([label]) => label).join(" | ")} |\n|${stats.map(() => "---:").join("|")}|\n| ${stats
      .map(([, value]) => `**${value}**`)
      .join(" | ")} |`,
  );

  parts.push(
    `_Minted all time: ${p.sugar_minted_all_time ?? 0} Sugar · Crawler Sugar hat keinen Geldwert und funktioniert nur in Crawler._${
      p.is_owner && p.sugar_mining_status ? `\nMining: **${p.sugar_mining_status}** · heute ${p.sugar_minted_today ?? 0}` : ""
    }`,
  );

  const messages = (result.tabs?.messages ?? []) as any[];
  const images = (result.tabs?.images ?? []) as any[];

  parts.push(
    `### 💬 Nachrichten\n${
      messages.length
        ? messages.map((m) => `- **${m.alias}**: ${m.text}  ♥ ${m.likes}`).join("\n")
        : "_Noch keine Nachrichten._"
    }`,
  );

  if (images.length) {
    parts.push(
      `### 🖼️ Bilder\n${images
        .map((i) => `![${i.alt_text || "Bild"}](${i.url})\n_${i.alias} · ♥ ${i.likes}_`)
        .join("\n\n")}`,
    );
  }

  return parts.join("\n\n");
}

/** Simple text bar chart for analytics rendering inside chat. */
function bar(value: number, max: number, width = 20): string {
  if (max <= 0) return "░".repeat(width);
  const filled = Math.max(value > 0 ? 1 : 0, Math.round((value / max) * width));
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}

function analyticsSummary(result: any): string {
  const metrics: Array<[string, number]> = [
    ["Profilaufrufe", result.profile_views ?? 0],
    ["Eindeutige Besuche", result.unique_visitors ?? 0],
    ["Neue Follower", result.new_followers ?? 0],
    ["Entfolgungen", result.unfollows ?? 0],
    ["Likes", result.likes ?? 0],
    ["Nachrichtenaufrufe", result.message_views ?? 0],
    ["Bildaufrufe", result.image_views ?? 0],
    ["Linkklicks", result.link_clicks ?? 0],
    ["Raumbesuche", result.room_visits ?? 0],
  ];
  const max = Math.max(1, ...metrics.map(([, v]) => v));

  const chart = metrics
    .map(([label, value]) => `${label.padEnd(20, " ")} ${bar(value, max)} ${value}`)
    .join("\n");

  const daily = (result.daily ?? []) as any[];
  const dayValues = daily.map((d) => Number(d.profile_view ?? 0));
  const dayMax = Math.max(1, ...dayValues);
  const trend = daily.length
    ? daily
        .slice(-14)
        .map((d, i) => `${String(d.day).slice(5)}  ${bar(Number(d.profile_view ?? 0), dayMax, 16)} ${dayValues.slice(-14)[i] ?? 0}`)
        .join("\n")
    : "Noch keine Daten in diesem Zeitraum.";

  return [
    `## 📊 Statistik für @${result.handle} · ${result.range_days} Tage`,
    "```text",
    chart,
    "```",
    `**Engagement:** ${result.engagement_rate_percent}% · **Ø Verweildauer:** ${result.average_visit_seconds}s · **Gerade anwesend:** 🟢 ${result.online_now} · **Follower gesamt:** ${result.followers_total} · **Likes gesamt:** ${result.likes_total}`,
    "### Profilaufrufe pro Tag",
    "```text",
    trend,
    "```",
  ].join("\n\n");
}

export const PROFILE_TOOLS: ProfileToolDefinition[] = [
  {
    name: "get_profile",
    title: "Profil ansehen",
    description:
      "Zeigt ein vollständiges Social-Media-Profil: Banner, Profilbild, Anzeigename, @handle, Bio, Ort, Link, Beitrittsdatum, Follower, Following, erhaltene Likes, Live-Anwesenheit sowie die Tabs Nachrichten, Bilder und Follower. Ohne username wird das eigene Profil gezeigt (mit Bearbeitungsmöglichkeiten und Following-Liste).",
    inputSchema: {
      type: "object",
      properties: {
        username: {
          type: "string",
          description: "Handle der Person, mit oder ohne @. Weglassen für das eigene Profil.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        profile: GET_PROFILE_PROFILE_SCHEMA,
        message: { type: "string", description: "Nur gesetzt, wenn das Profil privat und nicht das eigene ist." },
        redirected_from: {
          type: ["string", "null"],
          description: "Altes Handle, falls über einen Redirect aufgelöst.",
        },
        tabs: {
          type: "object",
          additionalProperties: true,
          properties: {
            messages: { type: "array", items: PROFILE_MESSAGE_ITEM },
            images: { type: "array", items: PROFILE_IMAGE_ITEM },
            followers: { type: "array", items: PROFILE_FOLLOWER_ITEM },
            following: { type: "array", items: PROFILE_FOLLOWING_ITEM },
          },
          required: ["messages", "images", "followers", "following"],
        },
        edit_hint: { type: ["string", "null"] },
        display_instruction: { type: "string" },
      },
      required: ["profile", "display_instruction"],
    },
    annotations: READ_ONLY,
    handler: (input, meta) => handleGetProfile(input, meta) as Promise<Json>,
    summary: profileSummary,
  },
  {
    name: "update_profile",
    title: "Profil bearbeiten",
    description:
      "Bearbeitet das eigene Profil: Anzeigename, Bio (max. 280 Zeichen), Ort, externer Link sowie Sichtbarkeit (öffentlich/privat) und die Schalter für Online-Status, Follower-Zahl und Likes. Nur der Besitzer kann sein Profil ändern.",
    inputSchema: {
      type: "object",
      properties: {
        display_name: { type: "string" },
        bio: { type: "string", description: "Max. 280 Zeichen." },
        location: { type: "string", description: "Max. 60 Zeichen." },
        external_url: { type: "string", description: "Eine Web-Adresse, z. B. sebklaey.app" },
        profile_visibility: { type: "string", enum: ["public", "private"] },
        show_online_status: { type: "boolean" },
        show_follower_count: { type: "boolean" },
        show_likes: { type: "boolean" },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        profile: FULL_PROFILE_SCHEMA,
        message: { type: "string" },
        display_instruction: { type: "string" },
      },
      required: ["profile", "message", "display_instruction"],
    },
    annotations: WRITE,
    handler: (input, meta) => handleUpdateProfile(input, meta) as Promise<Json>,
    summary: (result) => `${result.message} ${profileSummary(result)}`,
  },
  {
    name: "change_handle",
    title: "Handle ändern",
    description:
      "Ändert das eigene @handle (3–30 Zeichen, Kleinbuchstaben, Zahlen, Unterstriche). Handles sind eindeutig; das alte Handle leitet automatisch weiter. Ist der Wunschname vergeben, kommen freie Vorschläge zurück.",
    inputSchema: {
      type: "object",
      properties: { handle: { type: "string" } },
      required: ["handle"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        handle: { type: "string" },
        changed: { type: "boolean" },
        old_handle: { type: "string" },
        message: { type: "string" },
      },
      required: ["handle", "changed", "old_handle", "message"],
    },
    annotations: WRITE,
    handler: (input, meta) => handleChangeHandle(input, meta) as Promise<Json>,
    summary: (result) => String(result.message),
  },
  {
    name: "set_profile_image",
    title: "Profilbild oder Banner setzen",
    description:
      "Setzt oder entfernt Profilbild (kind: avatar) oder Bannerbild (kind: banner). Das Bild wird von einer https-Adresse geladen, auf JPG/PNG/WebP und max. 10 MB geprüft und von Metadaten (EXIF/GPS) befreit. Mit remove: true wird das Bild gelöscht.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["avatar", "banner"] },
        image_url: { type: "string", description: "https-Adresse des Bildes." },
        remove: { type: "boolean" },
      },
      required: ["kind"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        kind: { type: "string", enum: ["avatar", "banner"] },
        removed: { type: "boolean", description: "Nur gesetzt, wenn das Bild entfernt wurde." },
        url: {
          type: ["string", "null"],
          description: "Signierte Bild-URL. Nur gesetzt, wenn ein neues Bild gesetzt wurde.",
        },
        message: { type: "string" },
        display_instruction: { type: "string", description: "Nur gesetzt, wenn ein neues Bild gesetzt wurde." },
      },
      required: ["kind", "message"],
    },
    annotations: WRITE,
    handler: (input, meta) => handleSetProfileImage(input, meta) as Promise<Json>,
    summary: (result) => `${result.message}${result.url ? `\n![](${result.url})` : ""}`,
  },
  {
    name: "like_content",
    title: "Liken",
    description:
      "Liked ein Profil, eine Nachricht oder ein Bild. Ein Like pro Person und Inhalt; eigene Inhalte können nicht geliked werden.",
    inputSchema: likeInput,
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        target_type: { type: "string", enum: ["profile", "message", "image"] },
        likes: { type: "integer" },
        liked_by_me: { type: "boolean" },
        message: { type: "string" },
      },
      required: ["target_type", "likes", "liked_by_me", "message"],
    },
    annotations: WRITE,
    handler: (input, meta) => handleLikeContent(input, meta) as Promise<Json>,
    summary: (result) => `${result.message} (${result.likes} ♥)`,
  },
  {
    name: "unlike_content",
    title: "Like zurücknehmen",
    description: "Entfernt ein zuvor gesetztes Like von einem Profil, einer Nachricht oder einem Bild.",
    inputSchema: likeInput,
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        target_type: { type: "string", enum: ["profile", "message", "image"] },
        likes: { type: "integer" },
        liked_by_me: { type: "boolean", enum: [false] },
        message: { type: "string" },
      },
      required: ["target_type", "likes", "liked_by_me", "message"],
    },
    annotations: WRITE,
    handler: (input, meta) => handleUnlikeContent(input, meta) as Promise<Json>,
    summary: (result) => `${result.message} (${result.likes} ♥)`,
  },
  {
    name: "profile_analytics",
    title: "Meine Profil-Statistik",
    description:
      "Nur für den Besitzer: Profilaufrufe, eindeutige Besuche, neue Follower, Entfolgungen, Likes, Nachrichten- und Bildaufrufe, Linkklicks, Raumbesuche, durchschnittliche Verweildauer, aktuelle Anwesenheit, Engagement-Rate, Tagesverlauf und Top-Inhalte. Keine Identitäten anderer Personen.",
    inputSchema: {
      type: "object",
      properties: { range_days: { type: "number", enum: [7, 30, 90] } },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        handle: { type: "string" },
        range_days: { type: "integer", enum: [7, 30, 90] },
        profile_views: { type: "integer" },
        unique_visitors: { type: "integer" },
        new_followers: { type: "integer" },
        unfollows: { type: "integer" },
        likes: { type: "integer" },
        message_views: { type: "integer" },
        image_views: { type: "integer" },
        link_clicks: { type: "integer" },
        room_visits: { type: "integer" },
        unique_room_visitors: { type: "integer" },
        average_visit_seconds: { type: "integer" },
        online_now: { type: "integer" },
        followers_total: { type: "integer" },
        likes_total: { type: "integer" },
        engagement_rate_percent: { type: "number" },
        daily: { type: "array", items: ANALYTICS_DAY_ITEM },
        top_messages: { type: "array", items: TOP_CONTENT_ITEM },
        top_images: { type: "array", items: TOP_CONTENT_ITEM },
        privacy_note: { type: "string" },
        display_instruction: { type: "string" },
      },
      required: [
        "handle",
        "range_days",
        "profile_views",
        "unique_visitors",
        "new_followers",
        "unfollows",
        "likes",
        "message_views",
        "image_views",
        "link_clicks",
        "room_visits",
        "unique_room_visitors",
        "average_visit_seconds",
        "online_now",
        "followers_total",
        "likes_total",
        "engagement_rate_percent",
        "daily",
        "top_messages",
        "top_images",
        "privacy_note",
        "display_instruction",
      ],
    },
    annotations: READ_ONLY,
    handler: (input, meta) => handleProfileAnalytics(input, meta) as Promise<Json>,
    summary: analyticsSummary,
  },
  {
    name: "open_profile_link",
    title: "Profil-Link öffnen",
    description:
      "Gibt den externen Link eines Profils zurück und zählt den Klick für die Statistik des Besitzers.",
    inputSchema: {
      type: "object",
      properties: { username: { type: "string" } },
      required: ["username"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        url: { type: "string", description: "Leerer String, wenn kein Link hinterlegt ist." },
        message: { type: "string" },
      },
      required: ["url", "message"],
    },
    annotations: WRITE,
    handler: (input, meta) => handleTrackProfileLink(input, meta) as Promise<Json>,
    summary: (result) => (result.url ? `Link: ${result.url}` : "Dieses Profil hat keinen Link hinterlegt."),
  },
  {
    name: "block_profile",
    title: "Person blockieren",
    description:
      "Blockiert eine Person: ihr Profil ist für dich nicht mehr sichtbar und deines nicht mehr für sie.",
    inputSchema: {
      type: "object",
      properties: { username: { type: "string" }, reason: { type: "string" } },
      required: ["username"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        handle: { type: "string" },
        message: { type: "string" },
      },
      required: ["handle", "message"],
    },
    annotations: WRITE,
    handler: (input, meta) => handleBlockProfile(input, meta) as Promise<Json>,
    summary: (result) => String(result.message),
  },
];

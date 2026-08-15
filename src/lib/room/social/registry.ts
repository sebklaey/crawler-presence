/**
 * Central, extensible Social Provider Registry.
 *
 * Adding a platform later = one entry in this file (or one enabled row in
 * `social_provider_registry`). No new tables, no message-schema change, no new
 * MCP tool name.
 */

export type PreviewStrategy = "registry" | "oembed" | "public_metadata" | "basic_link";

export type SocialProvider = {
  id: string;
  displayName: string;
  aliases: string[];
  category: string;
  iconKey: string;
  canonicalHosts: string[];
  handlePattern?: string;
  profileUrlTemplate?: string;
  supportsHandle: boolean;
  supportsDirectUrl: boolean;
  supportsPublicPreview: boolean;
  sensitiveIdentifier: boolean;
  previewStrategy: PreviewStrategy;
};

const USER = "^[A-Za-z0-9._-]{1,64}$";
const SLUG = "^[A-Za-z0-9._~-]{1,96}$";

type Partial_ = Partial<SocialProvider> & Pick<SocialProvider, "id" | "displayName" | "category" | "canonicalHosts">;

function p(entry: Partial_): SocialProvider {
  return {
    aliases: [],
    iconKey: entry.id,
    supportsHandle: Boolean(entry.profileUrlTemplate),
    supportsDirectUrl: true,
    supportsPublicPreview: false,
    sensitiveIdentifier: false,
    previewStrategy: "registry",
    handlePattern: entry.profileUrlTemplate ? USER : undefined,
    ...entry,
  } as SocialProvider;
}

export const PROVIDERS: SocialProvider[] = [
  /* ------------------------- large social networks ------------------------ */
  p({ id: "instagram", displayName: "Instagram", category: "social", aliases: ["ig", "insta"], canonicalHosts: ["instagram.com", "www.instagram.com"], profileUrlTemplate: "https://www.instagram.com/{handle}/" }),
  p({ id: "x", displayName: "X", category: "social", aliases: ["twitter", "tweet", "x.com"], canonicalHosts: ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"], profileUrlTemplate: "https://x.com/{handle}" }),
  p({ id: "threads", displayName: "Threads", category: "social", aliases: [], canonicalHosts: ["threads.net", "www.threads.net", "threads.com", "www.threads.com"], profileUrlTemplate: "https://www.threads.net/@{handle}" }),
  p({ id: "facebook", displayName: "Facebook", category: "social", aliases: ["fb"], canonicalHosts: ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.com"], profileUrlTemplate: "https://www.facebook.com/{handle}" }),
  p({ id: "tiktok", displayName: "TikTok", category: "social", aliases: [], canonicalHosts: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com"], profileUrlTemplate: "https://www.tiktok.com/@{handle}" }),
  p({ id: "linkedin", displayName: "LinkedIn", category: "professional", aliases: ["linkedin_person", "li"], canonicalHosts: ["linkedin.com", "www.linkedin.com", "ch.linkedin.com", "de.linkedin.com"], profileUrlTemplate: "https://www.linkedin.com/in/{handle}", handlePattern: SLUG }),
  p({ id: "linkedin_company", displayName: "LinkedIn Company", category: "professional", aliases: ["linkedin company", "linkedincompany"], canonicalHosts: ["linkedin.com", "www.linkedin.com"], profileUrlTemplate: "https://www.linkedin.com/company/{handle}", handlePattern: SLUG }),
  p({ id: "youtube", displayName: "YouTube", category: "video", aliases: ["yt", "youtube_handle"], canonicalHosts: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"], profileUrlTemplate: "https://www.youtube.com/@{handle}" }),
  p({ id: "youtube_channel", displayName: "YouTube Channel", category: "video", aliases: ["yt channel", "youtubechannel"], canonicalHosts: ["youtube.com", "www.youtube.com"], profileUrlTemplate: "https://www.youtube.com/channel/{handle}", handlePattern: "^UC[A-Za-z0-9_-]{22}$" }),
  p({ id: "snapchat", displayName: "Snapchat", category: "social", aliases: ["snap"], canonicalHosts: ["snapchat.com", "www.snapchat.com"], profileUrlTemplate: "https://www.snapchat.com/add/{handle}" }),
  p({ id: "pinterest", displayName: "Pinterest", category: "social", aliases: [], canonicalHosts: ["pinterest.com", "www.pinterest.com", "pinterest.ch", "pinterest.de"], profileUrlTemplate: "https://www.pinterest.com/{handle}/" }),
  p({ id: "reddit", displayName: "Reddit", category: "social", aliases: [], canonicalHosts: ["reddit.com", "www.reddit.com", "old.reddit.com"], profileUrlTemplate: "https://www.reddit.com/user/{handle}" }),
  p({ id: "tumblr", displayName: "Tumblr", category: "social", aliases: [], canonicalHosts: ["tumblr.com", "www.tumblr.com"], profileUrlTemplate: "https://www.tumblr.com/{handle}" }),
  p({ id: "quora", displayName: "Quora", category: "social", aliases: [], canonicalHosts: ["quora.com", "www.quora.com"], profileUrlTemplate: "https://www.quora.com/profile/{handle}", handlePattern: SLUG }),

  /* ---------------------- decentralized / web3 networks ------------------- */
  p({ id: "farcaster", displayName: "Farcaster", category: "web3", aliases: ["warpcast"], canonicalHosts: ["farcaster.xyz", "www.farcaster.xyz", "warpcast.com", "www.warpcast.com"], profileUrlTemplate: "https://farcaster.xyz/{handle}" }),
  p({ id: "bluesky", displayName: "Bluesky", category: "social", aliases: ["bsky"], canonicalHosts: ["bsky.app", "www.bsky.app"], profileUrlTemplate: "https://bsky.app/profile/{handle}", handlePattern: "^[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+$" }),
  p({ id: "mastodon", displayName: "Mastodon", category: "social", aliases: ["fediverse"], canonicalHosts: [], profileUrlTemplate: "", handlePattern: "^@?[A-Za-z0-9._-]{1,64}@[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+$" }),
  p({ id: "nostr", displayName: "Nostr", category: "web3", aliases: [], canonicalHosts: ["njump.me", "primal.net", "snort.social"], profileUrlTemplate: "https://njump.me/{handle}", handlePattern: "^npub1[a-z0-9]{20,70}$" }),
  p({ id: "lens", displayName: "Lens", category: "web3", aliases: [], canonicalHosts: ["hey.xyz", "www.hey.xyz", "lens.xyz"], profileUrlTemplate: "https://hey.xyz/u/{handle}" }),
  p({ id: "zora", displayName: "Zora", category: "web3", aliases: [], canonicalHosts: ["zora.co", "www.zora.co"], profileUrlTemplate: "https://zora.co/{handle}" }),
  p({ id: "mirror", displayName: "Mirror", category: "web3", aliases: [], canonicalHosts: ["mirror.xyz", "www.mirror.xyz"], profileUrlTemplate: "https://mirror.xyz/{handle}" }),
  p({ id: "opensea", displayName: "OpenSea", category: "web3", aliases: [], canonicalHosts: ["opensea.io", "www.opensea.io"], profileUrlTemplate: "https://opensea.io/{handle}" }),
  p({ id: "foundation", displayName: "Foundation", category: "web3", aliases: [], canonicalHosts: ["foundation.app", "www.foundation.app"], profileUrlTemplate: "https://foundation.app/@{handle}" }),
  p({ id: "rarible", displayName: "Rarible", category: "web3", aliases: [], canonicalHosts: ["rarible.com", "www.rarible.com"], profileUrlTemplate: "https://rarible.com/{handle}" }),

  /* --------------------- creator / art / portfolio ------------------------ */
  p({ id: "behance", displayName: "Behance", category: "creator", aliases: [], canonicalHosts: ["behance.net", "www.behance.net"], profileUrlTemplate: "https://www.behance.net/{handle}" }),
  p({ id: "dribbble", displayName: "Dribbble", category: "creator", aliases: [], canonicalHosts: ["dribbble.com", "www.dribbble.com"], profileUrlTemplate: "https://dribbble.com/{handle}" }),
  p({ id: "deviantart", displayName: "DeviantArt", category: "creator", aliases: [], canonicalHosts: ["deviantart.com", "www.deviantart.com"], profileUrlTemplate: "https://www.deviantart.com/{handle}" }),
  p({ id: "artstation", displayName: "ArtStation", category: "creator", aliases: [], canonicalHosts: ["artstation.com", "www.artstation.com"], profileUrlTemplate: "https://www.artstation.com/{handle}" }),
  p({ id: "flickr", displayName: "Flickr", category: "creator", aliases: [], canonicalHosts: ["flickr.com", "www.flickr.com"], profileUrlTemplate: "https://www.flickr.com/photos/{handle}" }),
  p({ id: "px500", displayName: "500px", category: "creator", aliases: ["500px"], canonicalHosts: ["500px.com", "www.500px.com"], profileUrlTemplate: "https://500px.com/p/{handle}" }),
  p({ id: "vsco", displayName: "VSCO", category: "creator", aliases: [], canonicalHosts: ["vsco.co", "www.vsco.co"], profileUrlTemplate: "https://vsco.co/{handle}" }),
  p({ id: "patreon", displayName: "Patreon", category: "creator", aliases: [], canonicalHosts: ["patreon.com", "www.patreon.com"], profileUrlTemplate: "https://www.patreon.com/{handle}" }),
  p({ id: "kofi", displayName: "Ko-fi", category: "creator", aliases: ["ko-fi", "ko fi"], canonicalHosts: ["ko-fi.com", "www.ko-fi.com"], profileUrlTemplate: "https://ko-fi.com/{handle}" }),
  p({ id: "buymeacoffee", displayName: "Buy Me a Coffee", category: "creator", aliases: ["buy me a coffee", "bmac"], canonicalHosts: ["buymeacoffee.com", "www.buymeacoffee.com"], profileUrlTemplate: "https://buymeacoffee.com/{handle}" }),
  p({ id: "gumroad", displayName: "Gumroad", category: "creator", aliases: [], canonicalHosts: ["gumroad.com"], profileUrlTemplate: "https://{handle}.gumroad.com" }),
  p({ id: "substack", displayName: "Substack", category: "creator", aliases: [], canonicalHosts: ["substack.com"], profileUrlTemplate: "https://{handle}.substack.com" }),
  p({ id: "medium", displayName: "Medium", category: "creator", aliases: [], canonicalHosts: ["medium.com", "www.medium.com"], profileUrlTemplate: "https://medium.com/@{handle}" }),

  /* --------------------------- video / livestream ------------------------- */
  p({ id: "twitch", displayName: "Twitch", category: "video", aliases: [], canonicalHosts: ["twitch.tv", "www.twitch.tv"], profileUrlTemplate: "https://www.twitch.tv/{handle}" }),
  p({ id: "kick", displayName: "Kick", category: "video", aliases: [], canonicalHosts: ["kick.com", "www.kick.com"], profileUrlTemplate: "https://kick.com/{handle}" }),
  p({ id: "vimeo", displayName: "Vimeo", category: "video", aliases: [], canonicalHosts: ["vimeo.com", "www.vimeo.com"], profileUrlTemplate: "https://vimeo.com/{handle}" }),
  p({ id: "dailymotion", displayName: "Dailymotion", category: "video", aliases: [], canonicalHosts: ["dailymotion.com", "www.dailymotion.com"], profileUrlTemplate: "https://www.dailymotion.com/{handle}" }),
  p({ id: "rumble", displayName: "Rumble", category: "video", aliases: [], canonicalHosts: ["rumble.com", "www.rumble.com"], profileUrlTemplate: "https://rumble.com/c/{handle}" }),

  /* ------------------------------ music / audio --------------------------- */
  p({ id: "spotify_artist", displayName: "Spotify Artist", category: "music", aliases: ["spotify"], canonicalHosts: ["open.spotify.com", "spotify.com", "www.spotify.com"], profileUrlTemplate: "https://open.spotify.com/artist/{handle}", handlePattern: "^[A-Za-z0-9]{22}$" }),
  p({ id: "spotify_user", displayName: "Spotify User", category: "music", aliases: ["spotify user"], canonicalHosts: ["open.spotify.com"], profileUrlTemplate: "https://open.spotify.com/user/{handle}" }),
  p({ id: "apple_music", displayName: "Apple Music Artist", category: "music", aliases: ["applemusic", "apple music"], canonicalHosts: ["music.apple.com"], supportsHandle: false }),
  p({ id: "soundcloud", displayName: "SoundCloud", category: "music", aliases: [], canonicalHosts: ["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"], profileUrlTemplate: "https://soundcloud.com/{handle}" }),
  p({ id: "bandcamp", displayName: "Bandcamp", category: "music", aliases: [], canonicalHosts: ["bandcamp.com"], profileUrlTemplate: "https://{handle}.bandcamp.com" }),
  p({ id: "mixcloud", displayName: "Mixcloud", category: "music", aliases: [], canonicalHosts: ["mixcloud.com", "www.mixcloud.com"], profileUrlTemplate: "https://www.mixcloud.com/{handle}/" }),
  p({ id: "audiomack", displayName: "Audiomack", category: "music", aliases: [], canonicalHosts: ["audiomack.com", "www.audiomack.com"], profileUrlTemplate: "https://audiomack.com/{handle}" }),
  p({ id: "deezer", displayName: "Deezer", category: "music", aliases: [], canonicalHosts: ["deezer.com", "www.deezer.com"], profileUrlTemplate: "https://www.deezer.com/profile/{handle}" }),
  p({ id: "tidal", displayName: "Tidal", category: "music", aliases: [], canonicalHosts: ["tidal.com", "listen.tidal.com"], profileUrlTemplate: "https://tidal.com/browse/artist/{handle}", handlePattern: "^[0-9]{1,15}$" }),

  /* ---------------------- developer / professional ------------------------ */
  p({ id: "github", displayName: "GitHub", category: "developer", aliases: ["gh"], canonicalHosts: ["github.com", "www.github.com"], profileUrlTemplate: "https://github.com/{handle}" }),
  p({ id: "gitlab", displayName: "GitLab", category: "developer", aliases: [], canonicalHosts: ["gitlab.com", "www.gitlab.com"], profileUrlTemplate: "https://gitlab.com/{handle}" }),
  p({ id: "bitbucket", displayName: "Bitbucket", category: "developer", aliases: [], canonicalHosts: ["bitbucket.org", "www.bitbucket.org"], profileUrlTemplate: "https://bitbucket.org/{handle}/" }),
  p({ id: "stackoverflow", displayName: "Stack Overflow", category: "developer", aliases: ["stack overflow", "so"], canonicalHosts: ["stackoverflow.com", "www.stackoverflow.com"], profileUrlTemplate: "https://stackoverflow.com/users/{handle}", handlePattern: "^[0-9]{1,12}$" }),
  p({ id: "codepen", displayName: "CodePen", category: "developer", aliases: [], canonicalHosts: ["codepen.io", "www.codepen.io"], profileUrlTemplate: "https://codepen.io/{handle}" }),
  p({ id: "replit", displayName: "Replit", category: "developer", aliases: [], canonicalHosts: ["replit.com", "www.replit.com"], profileUrlTemplate: "https://replit.com/@{handle}" }),
  p({ id: "producthunt", displayName: "Product Hunt", category: "professional", aliases: ["product hunt"], canonicalHosts: ["producthunt.com", "www.producthunt.com"], profileUrlTemplate: "https://www.producthunt.com/@{handle}" }),
  p({ id: "wellfound", displayName: "Wellfound", category: "professional", aliases: ["angellist", "angel list"], canonicalHosts: ["wellfound.com", "www.wellfound.com", "angel.co"], profileUrlTemplate: "https://wellfound.com/u/{handle}" }),
  p({ id: "crunchbase", displayName: "Crunchbase", category: "professional", aliases: [], canonicalHosts: ["crunchbase.com", "www.crunchbase.com"], profileUrlTemplate: "https://www.crunchbase.com/organization/{handle}" }),

  /* --------------------------- messaging / community ---------------------- */
  p({ id: "whatsapp", displayName: "WhatsApp", category: "messaging", aliases: ["wa"], canonicalHosts: ["wa.me", "api.whatsapp.com", "chat.whatsapp.com"], profileUrlTemplate: "https://wa.me/{handle}", handlePattern: "^[0-9]{6,15}$", sensitiveIdentifier: true }),
  p({ id: "telegram", displayName: "Telegram", category: "messaging", aliases: ["tg"], canonicalHosts: ["t.me", "telegram.me", "telegram.dog"], profileUrlTemplate: "https://t.me/{handle}", sensitiveIdentifier: true }),
  p({ id: "signal", displayName: "Signal", category: "messaging", aliases: [], canonicalHosts: ["signal.me", "signal.group"], supportsHandle: false, sensitiveIdentifier: true }),
  p({ id: "discord_server", displayName: "Discord Server", category: "messaging", aliases: ["discord"], canonicalHosts: ["discord.com", "discord.gg", "discordapp.com"], supportsHandle: false, sensitiveIdentifier: true }),
  p({ id: "discord_invite", displayName: "Discord Invite", category: "messaging", aliases: ["discord invite"], canonicalHosts: ["discord.gg", "discord.com"], profileUrlTemplate: "https://discord.gg/{handle}", sensitiveIdentifier: true }),
  p({ id: "slack_community", displayName: "Slack Community", category: "messaging", aliases: ["slack"], canonicalHosts: ["slack.com", "join.slack.com"], supportsHandle: false, sensitiveIdentifier: true }),
  p({ id: "line", displayName: "LINE", category: "messaging", aliases: [], canonicalHosts: ["line.me", "lin.ee"], profileUrlTemplate: "https://line.me/ti/p/~{handle}", sensitiveIdentifier: true }),
  p({ id: "wechat", displayName: "WeChat", category: "messaging", aliases: [], canonicalHosts: ["weixin.qq.com", "wechat.com"], supportsHandle: false, sensitiveIdentifier: true }),
  p({ id: "viber", displayName: "Viber", category: "messaging", aliases: [], canonicalHosts: ["viber.com", "invite.viber.com", "chats.viber.com"], supportsHandle: false, sensitiveIdentifier: true }),

  /* ------------------------------- regional ------------------------------- */
  p({ id: "vk", displayName: "VK", category: "regional", aliases: [], canonicalHosts: ["vk.com", "www.vk.com"], profileUrlTemplate: "https://vk.com/{handle}" }),
  p({ id: "weibo", displayName: "Weibo", category: "regional", aliases: [], canonicalHosts: ["weibo.com", "www.weibo.com"], profileUrlTemplate: "https://weibo.com/{handle}" }),
  p({ id: "douyin", displayName: "Douyin", category: "regional", aliases: [], canonicalHosts: ["douyin.com", "www.douyin.com"], profileUrlTemplate: "https://www.douyin.com/user/{handle}" }),
  p({ id: "kuaishou", displayName: "Kuaishou", category: "regional", aliases: [], canonicalHosts: ["kuaishou.com", "www.kuaishou.com"], profileUrlTemplate: "https://www.kuaishou.com/profile/{handle}" }),
  p({ id: "xiaohongshu", displayName: "Xiaohongshu", category: "regional", aliases: ["rednote", "red note"], canonicalHosts: ["xiaohongshu.com", "www.xiaohongshu.com"], profileUrlTemplate: "https://www.xiaohongshu.com/user/profile/{handle}" }),
  p({ id: "kakaotalk", displayName: "KakaoTalk", category: "regional", aliases: ["kakao"], canonicalHosts: ["open.kakao.com", "pf.kakao.com"], supportsHandle: false, sensitiveIdentifier: true }),
  p({ id: "naver_blog", displayName: "Naver Blog", category: "regional", aliases: ["naver"], canonicalHosts: ["blog.naver.com", "naver.com"], profileUrlTemplate: "https://blog.naver.com/{handle}" }),

  /* -------------------------- websites / link hubs ------------------------ */
  p({ id: "personal_website", displayName: "Personal Website", category: "website", aliases: ["website", "homepage"], canonicalHosts: [], supportsHandle: false, previewStrategy: "basic_link" }),
  p({ id: "portfolio", displayName: "Portfolio", category: "website", aliases: [], canonicalHosts: [], supportsHandle: false, previewStrategy: "basic_link" }),
  p({ id: "linktree", displayName: "Linktree", category: "website", aliases: ["linktr.ee"], canonicalHosts: ["linktr.ee", "www.linktr.ee"], profileUrlTemplate: "https://linktr.ee/{handle}" }),
  p({ id: "beacons", displayName: "Beacons", category: "website", aliases: [], canonicalHosts: ["beacons.ai", "www.beacons.ai"], profileUrlTemplate: "https://beacons.ai/{handle}" }),
  p({ id: "carrd", displayName: "Carrd", category: "website", aliases: [], canonicalHosts: ["carrd.co"], profileUrlTemplate: "https://{handle}.carrd.co" }),
  p({ id: "bento", displayName: "Bento", category: "website", aliases: ["bento.me"], canonicalHosts: ["bento.me", "www.bento.me"], profileUrlTemplate: "https://bento.me/{handle}" }),
  p({ id: "custom_social", displayName: "Custom link", category: "website", aliases: ["social", "custom", "other", "link"], canonicalHosts: [], supportsHandle: false, previewStrategy: "basic_link" }),
];

const BY_ID = new Map(PROVIDERS.map((provider) => [provider.id, provider]));

function key(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

const BY_ALIAS = new Map<string, SocialProvider>();
for (const provider of PROVIDERS) {
  BY_ALIAS.set(key(provider.id), provider);
  BY_ALIAS.set(key(provider.displayName), provider);
  for (const alias of provider.aliases) BY_ALIAS.set(key(alias), provider);
}

const BY_HOST = new Map<string, SocialProvider>();
for (const provider of PROVIDERS) {
  for (const host of provider.canonicalHosts) {
    if (!BY_HOST.has(host)) BY_HOST.set(host, provider);
  }
}

export function getProvider(id: string): SocialProvider | null {
  return BY_ID.get(id) ?? null;
}

/** Resolves a provider from a user-supplied name or alias ("twitter" -> x). */
export function findProviderByAlias(name: string): SocialProvider | null {
  return BY_ALIAS.get(key(name)) ?? null;
}

/** Resolves a provider from a hostname; null when the host is unknown. */
export function findProviderByHost(hostname: string): SocialProvider | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const direct = BY_HOST.get(host);
  if (direct) return direct;
  // Subdomain hosts (foo.substack.com, foo.bandcamp.com, foo.gumroad.com …)
  for (const [known, provider] of BY_HOST) {
    if (host.endsWith(`.${known}`)) return provider;
  }
  return null;
}

export function providerCatalog() {
  return PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.displayName,
    category: provider.category,
    aliases: provider.aliases,
    supports_handle: provider.supportsHandle,
    supports_direct_url: provider.supportsDirectUrl,
    sensitive_identifier: provider.sensitiveIdentifier,
  }));
}

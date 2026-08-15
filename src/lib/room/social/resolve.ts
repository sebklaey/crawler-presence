/**
 * Server-side normalization and hard URL safety for social profile links.
 *
 * Every input is untrusted. We use a real URL parser (never a bare regex),
 * allow https only, and — for known providers — only the canonical hosts from
 * the registry. Nothing is fetched from the outside here, so this path cannot
 * be abused for SSRF; previews fall back to an honest "basic" card.
 */
import { roomError } from "../errors";
import {
  findProviderByAlias,
  findProviderByHost,
  getProvider,
  type SocialProvider,
} from "./registry";

export type PreviewStatus = "basic" | "public_metadata" | "verified_source" | "unavailable";

export interface ResolvedProfile {
  provider: string;
  provider_label: string;
  icon_key: string;
  category: string;
  display_handle: string | null;
  canonical_url: string;
  preview_status: PreviewStatus;
  title: string;
  description: string | null;
  avatar_url: string | null;
  verified: false;
  requires_sensitive_confirmation: boolean;
  validation_status: "valid";
}

const BLOCKED_HOST = /^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;

function isPrivateAddress(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split(".").map(Number);
    const [a, b] = [parts[0]!, parts[1]!];
    if (parts.some((n) => n > 255)) return true;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  // Any bracketed / colon form is an IPv6 literal — never allowed.
  return host.includes(":") || host.startsWith("[");
}

/** Parses and hard-validates a public https URL. Throws INVALID_INPUT. */
export function assertSafeUrl(raw: string): URL {
  let url: URL;
  const candidate = raw.trim();
  try {
    url = new URL(candidate);
  } catch {
    throw roomError("INVALID_INPUT", "Das ist keine gültige URL. Bitte gib eine vollständige https-Adresse an.");
  }
  if (url.protocol !== "https:") {
    throw roomError("INVALID_INPUT", "Nur https-Links sind erlaubt.");
  }
  if (url.username || url.password) {
    throw roomError("INVALID_INPUT", "Links mit eingebetteten Zugangsdaten sind nicht erlaubt.");
  }
  const host = url.hostname.toLowerCase();
  if (!host || BLOCKED_HOST.test(host) || isPrivateAddress(host) || !host.includes(".")) {
    throw roomError("INVALID_INPUT", "Diese Adresse ist nicht öffentlich erreichbar und wird nicht akzeptiert.");
  }
  // Drop tracking parameters and fragments; keep the clean public profile URL.
  const cleaned = new URL(`https://${host}${url.pathname}`);
  for (const [name, value] of url.searchParams) {
    if (!/^(utm_|fbclid|gclid|igshid|ref$|ref_|si$)/i.test(name)) cleaned.searchParams.set(name, value);
  }
  return cleaned;
}

function stripAt(value: string): string {
  return value.trim().replace(/^@+/, "");
}

function segments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
}

function looksLikeUrl(value: string): boolean {
  return /^(https?:\/\/|[a-z0-9-]+(\.[a-z0-9-]+)+\/)/i.test(value.trim());
}

function normalizePhone(value: string): string | null {
  const digits = value.replace(/[^\d]/g, "");
  return digits.length >= 6 && digits.length <= 15 ? digits : null;
}

function applyTemplate(provider: SocialProvider, handle: string): string {
  const template = provider.profileUrlTemplate;
  if (!template) throw roomError("INVALID_INPUT", `${provider.displayName} braucht die vollständige öffentliche Profil-URL.`);
  return template.replace("{handle}", encodeURIComponent(handle).replace(/%40/g, "@"));
}

function checkPattern(provider: SocialProvider, handle: string) {
  if (!provider.handlePattern) return;
  if (!new RegExp(provider.handlePattern).test(handle)) {
    throw roomError(
      "INVALID_INPUT",
      `Daraus konnte ich keinen gültigen ${provider.displayName}-Profillink erzeugen. Bitte gib den Handle ohne Leerzeichen an.`,
    );
  }
}

/** Extracts a display handle from a canonical provider URL, when possible. */
function handleFromUrl(provider: SocialProvider, url: URL): string | null {
  const parts = segments(url);
  const first = parts[0] ?? "";
  switch (provider.id) {
    case "mastodon":
      return first.startsWith("@") ? `${first}@${url.hostname}` : null;
    case "youtube":
      if (first.startsWith("@")) return first;
      if (first === "c" && parts[1]) return parts[1];
      return null;
    case "youtube_channel":
      return parts[0] === "channel" && parts[1] ? parts[1] : null;
    case "linkedin":
      return parts[0] === "in" && parts[1] ? parts[1] : null;
    case "linkedin_company":
      return parts[0] === "company" && parts[1] ? parts[1] : null;
    case "bluesky":
      return parts[0] === "profile" && parts[1] ? parts[1] : null;
    case "reddit":
      return (parts[0] === "user" || parts[0] === "u") && parts[1] ? parts[1] : null;
    case "whatsapp":
      return url.hostname === "wa.me" ? normalizePhone(first) : null;
    default:
      return first ? stripAt(first) : null;
  }
}

/** Provider-specific URL building for identifiers that are not plain handles. */
function fromIdentifier(provider: SocialProvider, rawIdentifier: string): { handle: string; url: string } {
  const raw = rawIdentifier.trim();

  if (provider.id === "whatsapp") {
    const digits = normalizePhone(raw);
    if (!digits) throw roomError("INVALID_INPUT", "Bitte gib die WhatsApp-Nummer im internationalen Format an, z. B. +41791234567.");
    return { handle: `+${digits}`, url: `https://wa.me/${digits}` };
  }

  if (provider.id === "mastodon") {
    const value = raw.startsWith("@") ? raw : `@${raw}`;
    checkPattern(provider, value);
    const [, name, instance] = value.match(/^@([^@]+)@(.+)$/) ?? [];
    if (!name || !instance) throw roomError("INVALID_INPUT", "Mastodon braucht Handle und Instanz, z. B. @name@mastodon.social.");
    return { handle: `@${name}@${instance}`, url: `https://${instance.toLowerCase()}/@${name}` };
  }

  if (provider.id === "youtube") {
    const value = stripAt(raw);
    if (/^UC[A-Za-z0-9_-]{22}$/.test(value)) {
      const channel = getProvider("youtube_channel")!;
      return { handle: value, url: applyTemplate(channel, value) };
    }
    checkPattern(provider, value);
    return { handle: `@${value}`, url: applyTemplate(provider, value) };
  }

  if (provider.id === "bluesky") {
    const value = stripAt(raw).toLowerCase();
    checkPattern(provider, value);
    return { handle: value, url: applyTemplate(provider, value) };
  }

  const value = stripAt(raw);
  checkPattern(provider, value);
  const url = applyTemplate(provider, value);
  const displayed =
    provider.category === "developer" || provider.handlePattern === "^[0-9]{1,12}$"
      ? value
      : `@${value}`;
  return { handle: displayed, url };
}

export interface ResolveInput {
  provider?: string | null;
  identifier?: string | null;
  profile_url?: string | null;
  label?: string | null;
}

/**
 * Detects the platform, normalizes the handle and produces a safe canonical
 * URL. Nothing is published here.
 */
export function resolveSocialProfile(input: ResolveInput): ResolvedProfile {
  const rawProvider = (input.provider ?? "").trim();
  const rawIdentifier = (input.identifier ?? "").trim();
  const rawUrl = (input.profile_url ?? "").trim();

  let provider = rawProvider ? findProviderByAlias(rawProvider) : null;
  if (rawProvider && !provider && !rawUrl && !looksLikeUrl(rawIdentifier)) {
    throw roomError(
      "NOT_FOUND",
      "Für diese Plattform habe ich noch keine eigene Provider-Definition. Du kannst die vollständige öffentliche https-Profil-URL als custom social link posten.",
    );
  }

  // The identifier itself may be a URL ("instagram.com/sebklaey").
  const urlCandidate = rawUrl || (looksLikeUrl(rawIdentifier) ? rawIdentifier : "");

  if (urlCandidate) {
    const withScheme = /^https?:\/\//i.test(urlCandidate) ? urlCandidate : `https://${urlCandidate}`;
    const url = assertSafeUrl(withScheme);
    const detected = findProviderByHost(url.hostname);

    if (provider && provider.id !== "custom_social" && provider.canonicalHosts.length) {
      const allowed =
        provider.canonicalHosts.includes(url.hostname) ||
        provider.canonicalHosts.some((host) => url.hostname.endsWith(`.${host}`));
      if (!allowed) {
        throw roomError(
          "INVALID_INPUT",
          `Diese Adresse gehört nicht zu ${provider.displayName}. Ich zeige einen Link nie unter einer falschen Plattform an.`,
        );
      }
    }

    const effective = provider && provider.id !== "custom_social" ? provider : (detected ?? getProvider("custom_social")!);
    const handle = effective.id === "custom_social" ? null : handleFromUrl(effective, url);
    const canonical = handle ? fromIdentifier(effective, handle).url : url.toString();
    const label = (input.label ?? "").trim();

    return card(effective, handle ? normalizeDisplay(effective, handle) : label || url.hostname, canonical, {
      customHost: effective.id === "custom_social" ? url.hostname : null,
    });
  }

  if (!provider) throw roomError("INVALID_INPUT", "Bitte gib die Plattform oder die vollständige Profil-URL an.");
  if (!rawIdentifier) throw roomError("INVALID_INPUT", "Bitte gib den Handle oder die Profil-URL an.");
  if (!provider.supportsHandle) {
    throw roomError("INVALID_INPUT", `${provider.displayName} braucht die vollständige öffentliche https-URL.`);
  }

  const { handle, url } = fromIdentifier(provider, rawIdentifier);
  // Re-validate the generated URL through the same safety gate.
  const safe = assertSafeUrl(url);
  return card(provider, handle, safe.toString(), { customHost: null });
}

function normalizeDisplay(provider: SocialProvider, handle: string): string {
  if (provider.id === "mastodon" || handle.startsWith("@") || handle.startsWith("+")) return handle;
  if (provider.id === "whatsapp") return `+${handle}`;
  if (provider.category === "developer" || /^[0-9]+$/.test(handle) || provider.id === "bluesky") return handle;
  return `@${handle}`;
}

function card(
  provider: SocialProvider,
  displayHandle: string | null,
  canonicalUrl: string,
  options: { customHost: string | null },
): ResolvedProfile {
  const label = options.customHost ?? provider.displayName;
  return {
    provider: provider.id,
    provider_label: label,
    icon_key: provider.iconKey,
    category: provider.category,
    display_handle: displayHandle,
    canonical_url: canonicalUrl,
    preview_status: "basic",
    title: provider.id === "custom_social" ? `Public profile on ${options.customHost}` : `${provider.displayName} profile`,
    description: null,
    avatar_url: null,
    verified: false,
    requires_sensitive_confirmation: provider.sensitiveIdentifier,
    validation_status: "valid",
  };
}

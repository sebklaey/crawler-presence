/**
 * Text and widget rendering for social profile cards.
 *
 * The card text is a normal plain-text room message — it goes through the same
 * validation, moderation, rate-limit and retention pipeline as every other
 * message. The HTML widget is only an addition for MCP clients; every tool
 * result also works as plain markdown text.
 */
import { escapeHtml } from "../validation";
import type { ResolvedProfile } from "./resolve";

export const SOCIAL_PREFIX = "🔗 ";
export const SOCIAL_UI_RESOURCE = "ui://crawler/social-profile-card-v1.html";
export const SOCIAL_UI_MIME = "text/html;profile=mcp-app";

export const PUBLIC_NOTICE =
  "Social profile links posted in Crawler rooms are public. Anyone may open, copy or share them.";

export const SENSITIVE_NOTICE =
  "Your link contains a phone number or personal contact value. This Crawler room is public and anyone may open or copy the link. Post it publicly?";

/** The plain-text body that is stored as a normal public room message. */
export function socialMessageBody(profile: ResolvedProfile): string {
  const head = profile.display_handle
    ? `${profile.provider_label} · ${profile.display_handle}`
    : profile.provider_label;
  return `${SOCIAL_PREFIX}${head}\n${profile.title}\n${profile.canonical_url}`;
}

/** Markdown fallback — always present, also when no widget renders. */
export function socialMarkdown(profile: ResolvedProfile): string {
  const label = profile.display_handle ?? profile.canonical_url;
  return `${profile.provider_label}: [${label}](${profile.canonical_url})`;
}

/** Parses a stored room message back into a card, or null for normal text. */
export function parseSocialBody(body: string): {
  headline: string;
  title: string;
  url: string;
} | null {
  if (!body.startsWith(SOCIAL_PREFIX)) return null;
  const [head, title, url] = body.slice(SOCIAL_PREFIX.length).split("\n");
  if (!head || !url || !/^https:\/\//.test(url)) return null;
  return { headline: head, title: title ?? "", url };
}

export function socialStructuredContent(profile: ResolvedProfile, extra: Record<string, unknown> = {}) {
  return {
    provider: profile.provider,
    provider_label: profile.provider_label,
    display_handle: profile.display_handle,
    canonical_url: profile.canonical_url,
    preview_status: profile.preview_status,
    title: profile.title,
    description: profile.description,
    avatar_url: profile.avatar_url,
    verified: false,
    is_identity_verified: false,
    contains_sensitive_contact: profile.requires_sensitive_confirmation,
    ...extra,
  };
}

/**
 * The versioned MCP App UI resource. Self-contained, no external resources,
 * no iframes, no trackers — it only renders values handed to it by the host
 * and opens the server-validated canonical URL.
 */
export function socialCardHtml(profile: ResolvedProfile, context: { room: string | null; postedAt: string | null; sender: string | null }): string {
  const data = JSON.stringify({
    provider_label: profile.provider_label,
    icon_key: profile.icon_key,
    display_handle: profile.display_handle,
    canonical_url: profile.canonical_url,
    title: profile.title,
    preview_status: profile.preview_status,
    sensitive: profile.requires_sensitive_confirmation,
    room: context.room,
    posted_at: context.postedAt,
    sender: context.sender,
  }).replace(/</g, "\\u003c");

  return `<!doctype html><meta charset="utf-8">
<style>
  :root{color-scheme:light dark}
  body{margin:0;font:14px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#111}
  .card{border:1px solid #e5e5e5;border-radius:14px;padding:14px 16px;max-width:420px;background:#fff}
  .row{display:flex;align-items:center;gap:8px}
  .icon{width:26px;height:26px;border-radius:8px;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600}
  .platform{font-weight:600}
  .handle{margin:8px 0 2px;font-size:17px;font-weight:600;word-break:break-all}
  .muted{color:#6b6b6b;font-size:12px}
  a.open{display:inline-block;margin-top:12px;padding:8px 12px;border:1px solid #111;border-radius:999px;color:#111;text-decoration:none;font-weight:600}
  .warn{margin-top:10px;padding:8px 10px;border-radius:10px;background:#f6f6f6;font-size:12px}
  @media (prefers-color-scheme:dark){body{color:#f5f5f5}.card{background:#0c0c0c;border-color:#262626}.icon{background:#f5f5f5;color:#0c0c0c}a.open{color:#f5f5f5;border-color:#f5f5f5}.warn{background:#161616}}
</style>
<div class="card" id="card"></div>
<script>
(function(){
  var d = ${data};
  var esc = function(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c]; }); };
  var safe = /^https:\\/\\//.test(d.canonical_url || "") ? d.canonical_url : null;
  var html = ''
    + '<div class="row"><span class="icon">' + esc((d.provider_label||"?").slice(0,2)) + '</span>'
    + '<span class="platform">' + esc(d.provider_label) + '</span></div>'
    + '<div class="handle">' + esc(d.display_handle || safe || "") + '</div>'
    + '<div class="muted">' + esc(d.title) + ' · preview: ' + esc(d.preview_status) + ' · not an identity verification</div>'
    + (d.room ? '<div class="muted">' + esc(d.sender ? d.sender + " · " : "") + esc(d.room) + (d.posted_at ? ' · ' + esc(d.posted_at) : '') + '</div>' : '')
    + (d.sensitive ? '<div class="warn">Public contact link. Anyone may open or copy it.</div>' : '')
    + (safe ? '<a class="open" id="open" href="' + esc(safe) + '" target="_blank" rel="noopener noreferrer">Open profile \\u2197</a>' : '');
  document.getElementById("card").innerHTML = html;
  var open = document.getElementById("open");
  if (open && safe) {
    open.addEventListener("click", function(e){
      if (window.openai && typeof window.openai.openExternal === "function") {
        e.preventDefault();
        window.openai.openExternal({ href: safe, redirectUrl: false });
      }
    });
  }
  try { window.parent.postMessage({ type: "ui/initialize", payload: { ready: true } }, "*"); } catch (_) {}
})();
</script>`;
}

/** Escaped, safe HTML snippet used by the Crawler web room renderer. */
export function socialCardWebHtml(headline: string, title: string, url: string): string {
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(headline)} — ${escapeHtml(title)}</a>`;
}

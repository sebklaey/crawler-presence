/**
 * MCP App widgets for Crawler Love. Every widget has a full text fallback —
 * the tool summary — so the feature works without the apps bridge.
 * Widgets never render internal scores, vectors or raw interview answers.
 */
export const LOVE_UI_MIME = "text/html;profile=mcp-app";
export const LOVE_INTERVIEW_UI = "ui://crawler/love-interview-v1.html";
export const LOVE_PROFILE_UI = "ui://crawler/love-profile-v1.html";
export const LOVE_MATCH_UI = "ui://crawler/love-match-v1.html";

const escape = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const SHELL = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin:0; padding:20px; font:15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",sans-serif;
         color:#111; background:#fff; }
  @media (prefers-color-scheme: dark){ body{ color:#f4f4f5; background:#0b0b0c; } }
  .card { border:1px solid rgba(128,128,128,.28); border-radius:16px; padding:20px; max-width:520px; }
  h1 { font-size:17px; margin:0 0 4px; letter-spacing:-.01em; }
  .muted { opacity:.62; font-size:13px; margin:0; }
  .bar { height:4px; border-radius:999px; background:rgba(128,128,128,.2); margin:16px 0 6px; overflow:hidden; }
  .bar > i { display:block; height:100%; background:currentColor; }
  .q { font-size:19px; line-height:1.35; margin:18px 0 12px; letter-spacing:-.015em; }
  ul { margin:0; padding:0; list-style:none; display:grid; gap:6px; }
  li { border:1px solid rgba(128,128,128,.25); border-radius:10px; padding:9px 12px; font-size:14px; }
  .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
  .actions span { border:1px solid rgba(128,128,128,.3); border-radius:999px; padding:5px 12px; font-size:12.5px; }
  .note { margin-top:16px; font-size:12px; opacity:.6; }
  pre { white-space:pre-wrap; font:inherit; margin:12px 0 0; }
  .tag { display:inline-block; border:1px solid rgba(128,128,128,.3); border-radius:999px;
         padding:3px 10px; font-size:12px; margin:0 6px 6px 0; }
`;

function page(inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${SHELL}</style></head><body><div class="card">${inner}</div></body></html>`;
}

export function loveInterviewWidget(input: {
  question: string;
  area: string;
  options: string[];
  hint?: string | null;
  progress: number;
  step: number;
  total: number;
}): string {
  const options = input.options.length
    ? `<ul>${input.options.map((o) => `<li>${escape(o)}</li>`).join("")}</ul>`
    : "";
  return page(`
    <h1>Crawler Love — ${escape(input.area)}</h1>
    <p class="muted">Question ${input.step} of ${input.total}</p>
    <div class="bar"><i style="width:${Math.max(3, Math.min(100, input.progress))}%"></i></div>
    <p class="q">${escape(input.question)}</p>
    ${options}
    ${input.hint ? `<p class="note">${escape(input.hint)}</p>` : ""}
    <div class="actions"><span>Back</span><span>Skip</span><span>Save and exit</span><span>Continue</span></div>
    <p class="note">Your answers are encrypted, used only for mutual Crawler Love matching and never shown to another person. Never share addresses, financial details, passwords or recovery codes.</p>
  `);
}

export function loveProfileWidget(input: {
  summary: string;
  status: string;
  discoverable: boolean;
}): string {
  return page(`
    <h1>Your Crawler Love Profile</h1>
    <p class="muted">Status: ${escape(input.status)} · ${input.discoverable ? "discoverable" : "not discoverable"}</p>
    <pre>${escape(input.summary)}</pre>
    <div class="actions"><span>Edit</span><span>Activate</span><span>Pause</span><span>Delete</span></div>
    <p class="note">A Love Resonance Profile is an algorithmic compatibility profile, not a scientific or medical assessment.</p>
  `);
}

export function loveMatchWidget(input: {
  handle: string;
  display_name: string;
  bio: string;
  resonance_label: string;
  reasons: string[];
  mode: "candidate" | "request";
}): string {
  const actions =
    input.mode === "candidate"
      ? `<span>Send Love Match Request</span><span>Not now</span><span>Don't suggest again</span>`
      : `<span>Accept</span><span>Decline</span><span>Block</span><span>Report</span>`;
  return page(`
    <h1>@${escape(input.handle)} · ${escape(input.display_name)}</h1>
    <p class="muted">${escape(input.resonance_label)}</p>
    ${input.bio ? `<pre>${escape(input.bio)}</pre>` : ""}
    <div style="margin-top:14px">${input.reasons.map((r) => `<span class="tag">${escape(r)}</span>`).join("")}</div>
    <div class="actions">${actions}</div>
    <p class="note">If both of you accept, Crawler creates a publicly readable Pair Room. Only the two matched users can post in it.</p>
  `);
}

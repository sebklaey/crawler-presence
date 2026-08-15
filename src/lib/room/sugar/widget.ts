/**
 * The versioned MCP App UI resource for Crawler Sugar.
 * Self-contained: no external resources, no iframes, no trackers. It renders
 * only the values the server hands it and always shows the no-value notice.
 */
export const SUGAR_UI_RESOURCE = "ui://crawler/sugar-v1.html";
export const SUGAR_UI_MIME = "text/html;profile=mcp-app";

export interface SugarWidgetData {
  headline: string;
  handle: string | null;
  balance: number;
  minted_all_time: number;
  mining_status?: string | null;
  progress_percent?: number | null;
  daily_minted?: number | null;
  daily_cap?: number | null;
  global_supply?: number | null;
  global_maximum_supply?: number | null;
}

export function sugarWidgetHtml(data: SugarWidgetData): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<!doctype html><meta charset="utf-8">
<style>
  :root{color-scheme:light dark}
  body{margin:0;font:14px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#111}
  .card{border:1px solid #e5e5e5;border-radius:14px;padding:16px;max-width:420px;background:#fff}
  .head{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b6b6b}
  .bal{margin:6px 0 0;font-size:30px;font-weight:600;letter-spacing:-.02em}
  .sub{color:#6b6b6b;font-size:12px;margin-top:2px}
  .bar{height:6px;border-radius:999px;background:#ececec;margin:14px 0 6px;overflow:hidden}
  .fill{height:100%;background:#111}
  .row{display:flex;justify-content:space-between;font-size:12px;color:#6b6b6b}
  .note{margin-top:14px;padding:8px 10px;border-radius:10px;background:#f6f6f6;font-size:11px;color:#4a4a4a}
  @media (prefers-color-scheme:dark){body{color:#f5f5f5}.card{background:#0c0c0c;border-color:#262626}.bar{background:#222}.fill{background:#f5f5f5}.note{background:#161616;color:#bdbdbd}}
</style>
<div class="card" id="c"></div>
<script>
(function(){
  var d = ${json};
  var esc = function(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(ch){
    return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[ch]; }); };
  var num = function(v){ return Number(v || 0).toLocaleString(); };
  var pct = Math.max(0, Math.min(100, Number(d.progress_percent || 0)));
  var parts = [
    '<div class="head">' + esc(d.headline) + (d.handle ? ' · @' + esc(d.handle) : '') + '</div>',
    '<div class="bal">' + num(d.balance) + ' Sugar</div>',
    '<div class="sub">Minted all time: ' + num(d.minted_all_time) + '</div>'
  ];
  if (d.mining_status) {
    parts.push('<div class="bar"><div class="fill" style="width:' + pct + '%"></div></div>');
    parts.push('<div class="row"><span>Mining: ' + esc(d.mining_status) + '</span><span>' +
      num(d.daily_minted) + ' / ' + num(d.daily_cap) + ' today</span></div>');
  }
  if (d.global_maximum_supply) {
    parts.push('<div class="row" style="margin-top:6px"><span>Global supply</span><span>' +
      num(d.global_supply) + ' / ' + num(d.global_maximum_supply) + '</span></div>');
  }
  parts.push('<div class="note">Crawler Sugar has no monetary value. It is not a cryptocurrency, cannot be bought, sold or exchanged and works only inside Crawler.</div>');
  document.getElementById("c").innerHTML = parts.join("");
})();
</script>`;
}

import { roomTools } from "../../src/lib/mcp/tools/room-tools";
import { readFileSync } from "node:fs";
const names=new Set((roomTools as any[]).map(t=>t.name));
const bad=["start_interview","create_image_upload","submit_campaign_for_review","send_sugar","find_match","get_my_plan"];
for(const b of bad) console.log(b, names.has(b));
const m=JSON.parse(readFileSync(".lovable/mcp/manifest.json","utf8"));
for (const n of ["submit_campaign_for_review","send_sugar","get_my_plan"]) {
  const t=m.mcp.tools.find((x:any)=>x.name===n);
  console.log(n, JSON.stringify(t.outputSchema).slice(0,300));
}

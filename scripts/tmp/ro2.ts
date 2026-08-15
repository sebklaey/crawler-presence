import { roomTools } from "../../src/lib/mcp/tools/room-tools";
const ro = (roomTools as any[]).filter(t=>t.annotations?.readOnlyHint===true).map(t=>t.name);
console.log((roomTools as any[]).length, ro.length, JSON.stringify(ro));

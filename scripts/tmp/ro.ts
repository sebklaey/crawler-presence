import mcp from "../../src/lib/mcp/index";
const tools = (mcp as any).tools as any[];
const ro = tools.filter(t=>t.annotations?.readOnlyHint===true).map(t=>t.name);
console.log(tools.length, ro.length);
console.log(JSON.stringify(ro,null,0));

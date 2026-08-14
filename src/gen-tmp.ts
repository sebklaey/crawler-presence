import { crawlerCore } from "./lib/self-presence";
import { generatedFiles } from "./lib/knowledge";
const core = crawlerCore();
const files = generatedFiles(core);
console.log(JSON.stringify({ core, files: files.map(f=>({path:f.path,type:f.type,content:f.content})) }));

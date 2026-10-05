import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const directory = path.resolve(".test-runtime/evidence-fixture");
mkdirSync(directory, { recursive: true });
const configPath = path.resolve("dist/server/wrangler.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
config.main = path.resolve(path.dirname(configPath), config.main);
if (config.assets?.directory) config.assets.directory = path.resolve(path.dirname(configPath), config.assets.directory);
writeFileSync(path.join(directory, "wrangler.json"), JSON.stringify(config, null, 2));
// The fixture's config directory owns its secrets file; production keys are never copied.
writeFileSync(path.join(directory, ".dev.vars"), 'AI_PROVIDER="openai"\nOPENAI_API_KEY=""\nDEEPSEEK_API_KEY=""\n');
console.log("Isolated fixture configuration prepared without model credentials.");

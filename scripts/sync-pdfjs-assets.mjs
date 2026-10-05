import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const target = new URL("../public/pdfjs/", import.meta.url);
mkdirSync(target, { recursive: true });
for (const name of ["cmaps", "standard_fonts", "wasm"]) cpSync(new URL(`../node_modules/pdfjs-dist/${name}/`, import.meta.url), new URL(`${name}/`, target), { recursive: true });
cpSync(new URL("../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), new URL("pdf.worker.min.mjs", target));
console.log(`PDF rendering assets ready: ${fileURLToPath(target)}`);

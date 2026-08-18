import fs from "node:fs";

let index = fs.readFileSync("index.html", "utf8");
// V4: keep the existing UI and handlers intact; only add the cloud bridge.
index = index.replace(/\bV2\b/g, "V4");
index = index.replace(/(<title[^>]*>)[\s\S]*?(<\/title>)/i, "$1V4 — Miraculous.kk$2");
const marker = '<script src="/cloud-sync.js"></script>';
if (!index.includes(marker)) index = index.replace(/<\/body>/i, `${marker}</body>`);
fs.writeFileSync("index.html", index);

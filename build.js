import fs from "node:fs";

let index = fs.readFileSync("index.html", "utf8");
const marker = '<script src="/cloud-sync.js"></script>';
if (!index.includes(marker)) {
  index = index.replace(/<\/body>/i, `${marker}</body>`);
}
fs.writeFileSync("index.html", index);

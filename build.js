import fs from "node:fs";

const index = fs.readFileSync("index.html", "utf8");
const marker = '<script src="/global.js"></script>';
if (!index.includes(marker)) {
  const out = index.replace(/<\/body>/i, `${marker}</body>`);
  fs.writeFileSync("index.html", out);
  console.log("[build] global.js injected into index.html");
} else {
  console.log("[build] global.js already present");
}

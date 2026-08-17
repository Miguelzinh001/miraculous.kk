import fs from "node:fs";

let index = fs.readFileSync("index.html", "utf8");
const markers = [
  '<script src="/global.js"></script>',
  '<script src="/profile-fix.js"></script>'
];
for (const marker of markers) {
  if (!index.includes(marker)) {
    index = index.replace(/<\/body>/i, `${marker}</body>`);
    console.log(`[build] injected ${marker}`);
  }
}
fs.writeFileSync("index.html", index);

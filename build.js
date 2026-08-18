import fs from "node:fs";

let index = fs.readFileSync("index.html", "utf8");
index = index.replace(/\bV2\b/g, "V4");
index = index.replace(/<title[^>]*>[\s\S]*?<\/title>/i, "<title>V4 — Miraculous.kk</title>");
index = index.replace(/<script[^>]+src=[\"']\/cloud-sync\.js[\"'][^>]*><\/script>/gi, "");
index = index.replace(/<script[^>]+src=[\"']\/profile-fix\.js[\"'][^>]*><\/script>/gi, "");

const markers = [
  '<script src="/supabase-auth.js"></script>',
  '<script src="/supabase-live.js"></script>',
  '<script src="/supabase-actions.js"></script>',
  '<script src="/supabase-boot-fix.js"></script>',
  '<script src="/profile-repair.js"></script>'
];
for (const marker of markers) {
  if (!index.includes(marker)) index = index.replace(/<\/body>/i, `${marker}</body>`);
}
fs.writeFileSync("index.html", index);

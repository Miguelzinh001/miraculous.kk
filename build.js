import fs from "node:fs";

let index = fs.readFileSync("index.html", "utf8");

// V4 branding.
index = index.replace(/\bV2\b/g, "V4");
index = index.replace(/<title[^>]*>[\s\S]*?<\/title>/i, "<title>V4 — Miraculous.kk</title>");

// Remove the previous IndexedDB monkey-patch bridge completely.
index = index.replace(/<script[^>]+src=[\"']\/cloud-sync\.js[\"'][^>]*><\/script>/gi, "");

// Load the real Supabase Auth + database integration after the existing app code.
const markers = [
  '<script src="/supabase-auth.js"></script>',
  '<script src="/supabase-live.js"></script>'
];
for (const marker of markers) {
  if (!index.includes(marker)) index = index.replace(/<\/body>/i, `${marker}</body>`);
}

fs.writeFileSync("index.html", index);

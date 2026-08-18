import fs from "node:fs";

let index = fs.readFileSync("index.html", "utf8");
index = index.replace(/\bV[234]\b/g, "V5");
index = index.replace(/<title[^>]*>[\s\S]*?<\/title>/i, "<title>V5 — Miraculous.kk</title>");
index = index.replace(/<script[^>]+src=["']\/cloud-sync\.js["'][^>]*><\/script>/gi, "");
index = index.replace(/<script[^>]+src=["']\/profile-fix\.js["'][^>]*><\/script>/gi, "");

const markers = [
  '<script src="/supabase-auth.js"></script>',
  '<script src="/supabase-live.js"></script>',
  '<script src="/supabase-actions.js"></script>',
  '<script src="/supabase-boot-fix.js"></script>',
  '<script src="/profile-repair.js"></script>',
  '<script src="/global-v5.js"></script>'
];
for (const marker of markers) {
  if (!index.includes(marker)) index = index.replace(/<\/body>/i, `${marker}</body>`);
}

const htmlEnd = index.toLowerCase().lastIndexOf("</html>");
if (htmlEnd >= 0) index = index.slice(0, htmlEnd + 7);

fs.writeFileSync("index.html", index);

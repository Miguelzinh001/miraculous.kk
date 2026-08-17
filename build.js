import fs from "node:fs";

let index = fs.readFileSync("index.html", "utf8");

// Only inject the global database bridge. The previous profile-fix script
// installed a document-level capture handler and intercepted unrelated
// button clicks across the site. Profile behaviour belongs to the site's
// existing UI handlers instead of a global click interceptor.
const marker = '<script src="/global.js"></script>';
if (!index.includes(marker)) {
  index = index.replace(/<\/body>/i, `${marker}</body>`);
  console.log(`[build] injected ${marker}`);
}

fs.writeFileSync("index.html", index);
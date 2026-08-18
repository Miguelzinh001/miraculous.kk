import fs from "node:fs";

const index = fs.readFileSync("index.html", "utf8");
fs.writeFileSync("index.html", index);

// Local-only regression check. The app is fully local: no cloud sync, no
// backend calls, no watermark or personal promo links. A single builder
// credit line (name + phone) is required in the footer and help header.
// Run with: npm test
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
let failures = 0;

const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` :: ${extra}` : ""}`);
  if (!ok) failures++;
};

const html = read("index.html");
const guide = read("guide.html");
const appjs = read("app.js");
const dbjs = read("db.js");
const buildjs = read("build.js");

// 1. Cloud-sync artifacts must be gone.
for (const gone of ["sync.js", "supabaseClient.js", "cloud_sync_guide.png", "supabase"]) {
  check(`removed: ${gone}`, !fs.existsSync(path.join(root, gone)));
}

// 2. No cloud-sync references in source (excludes public/ build output).
const cloudPatterns = [
  "supabase", "Supabase", "SyncModal", "syncModal", "syncToCloud",
  "syncFromCloud", "handleSync", "syncStatusIndicator", "syncModalBtn",
  "Cloud Sync", "Cloud Backup", "cloud_sync", "Push Local Data",
  "Pull Cloud Data", "cloud_saves",
];
for (const [name, src] of [["index.html", html], ["guide.html", guide], ["app.js", appjs], ["db.js", dbjs], ["build.js", buildjs]]) {
  const hits = cloudPatterns.filter((p) => src.includes(p));
  check(`no cloud refs in ${name}`, hits.length === 0, hits.join(", "));
}

// 3. No watermark or personal promo links in user-facing sources.
const brandPatterns = [
  "Created by", "mr-heritage", "inioluwa-dev", "watermark-overlay",
  "wa.me/2349053949077",
];
for (const [name, src] of [["index.html", html], ["guide.html", guide], ["app.js", appjs]]) {
  const hits = brandPatterns.filter((p) => src.includes(p));
  check(`no promo branding in ${name}`, hits.length === 0, hits.join(", "));
}

// 3b. Required builder credit line (name + tappable phone number).
for (const [name, src] of [["index.html", html], ["guide.html", guide]]) {
  const hasCredit = src.includes("Built by Olayoriju Inioluwa")
    && src.includes("09133770970")
    && src.includes("tel:+2349133770970");
  check(`credit line in ${name}`, hasCredit);
}

// 4. Every local script tag must point at an existing file.
const localScripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)]
  .map((m) => m[1])
  .filter((s) => !s.startsWith("http") && !s.startsWith("/"));
check(
  "local scripts exist",
  localScripts.length > 0 && localScripts.every((s) => fs.existsSync(path.join(root, s))),
  localScripts.join(", "),
);

// 5. Every onclick handler must resolve to a defined function.
const handlers = new Set(
  [...html.matchAll(/onclick="([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]),
);
const defined = new Set([
  ...(appjs + dbjs).matchAll(/(?:const|let|function)\s+([A-Za-z_][A-Za-z0-9_]*)/g),
].map((m) => m[1]));
const dangling = [...handlers].filter((h) => !defined.has(h));
check("no dangling onclick handlers", dangling.length === 0, dangling.join(", ") || `${handlers.size} handlers ok`);

// 6. Every getElementById target must exist in index.html.
const idsInHtml = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const idsUsed = new Set(
  [...(appjs + dbjs).matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]),
);
const missing = [...idsUsed].filter((id) => !idsInHtml.has(id));
check("all element IDs resolve", missing.length === 0, missing.join(", ") || `${idsUsed.size} ids ok`);

console.log(failures ? "LOCAL-ONLY CHECK FAILED" : "LOCAL-ONLY CHECK OK");
process.exit(failures ? 1 : 0);

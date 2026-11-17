// Checks every script on the app page and every .js file in web/ for syntax errors.
// One stray character (like a literal "\n" between two lines) stops the whole page, on the website and in the app.
//   node tests/syntax-check.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const WEB = "web";
const bad = [];
const check = (file, label) => {
  const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (r.status !== 0) bad.push(`${label}:\n${(r.stderr || "").trim().split("\n").slice(0, 5).join("\n")}`);
};

const html = fs.readFileSync(path.join(WEB, "index.html"), "utf8");
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "syntax-"));
blocks.forEach((js, i) => {
  const f = path.join(tmp, `block-${i + 1}.js`);
  fs.writeFileSync(f, js);
  check(f, `web/index.html <script> block ${i + 1}`);
});
for (const name of fs.readdirSync(WEB).sort()) {
  if (name.endsWith(".js")) check(path.join(WEB, name), `web/${name}`);
}
fs.rmSync(tmp, { recursive: true, force: true });

if (bad.length) {
  console.error("Syntax check FAILED:\n" + bad.map(b => "  - " + b).join("\n"));
  process.exit(1);
}
console.log(`Syntax check passed: ${blocks.length} script blocks in web/index.html and every web/*.js file.`);

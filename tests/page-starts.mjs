// Opens the app page in a real (headless) Chrome and checks that it starts and doesn't freeze.
// Catches what a syntax check can't: a script that throws while starting, or a loop that locks
// the page up. The build only publishes when this passes, so a broken page never reaches phones or the website.
//
//   node tests/page-starts.mjs [folder] [page]      (defaults: web index.html)
//
// Needs the playwright package. In CI it uses the runner's Chrome (PAGE_TEST_CHANNEL=chrome).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = path.resolve(process.argv[2] || "web");
const pageName = process.argv[3] || "index.html";
const START_LIMIT_MS = 25000;   // the page must have drawn its status card by then
const WATCH_MS = 12000;         // then it must keep answering for this long
const ANSWER_LIMIT_MS = 4000;   // a page that can't answer for this long counts as frozen

const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || pageName;
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

const problems = [];
const browser = await chromium.launch(process.env.PAGE_TEST_CHANNEL ? { channel: process.env.PAGE_TEST_CHANNEL } : {});
const timeout = (ms, what) => new Promise((_, no) => setTimeout(() => no(new Error(what)), ms));

async function check(label, viewport) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")));
  // No internet in the test: live feeds fail, and the page has to cope with that like it does on a train.
  await page.route("**/*", r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  try {
    await Promise.race([page.goto(base + pageName, { waitUntil: "load" }), timeout(START_LIMIT_MS, "the page didn't finish loading")]);
    await Promise.race([
      page.waitForFunction(() => { const s = document.getElementById("status"); return s && s.textContent.trim().length > 0; },
        null, { timeout: START_LIMIT_MS }),
      timeout(START_LIMIT_MS + 1000, "the page froze while starting"),
    ]).catch(e => { throw new Error(/froze/.test(e.message) ? e.message : "the map's status card never appeared (the page didn't start)"); });
    const end = Date.now() + WATCH_MS;
    while (Date.now() < end) {
      await Promise.race([page.evaluate(() => performance.now()), timeout(ANSWER_LIMIT_MS, `the page froze (no answer for ${ANSWER_LIMIT_MS / 1000}s)`)]);
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (e) {
    problems.push(`${label}: ${e.message}`);
  }
  for (const e of errors) problems.push(`${label}: script error: ${e}`);
  await ctx.close().catch(() => {});
}

await check("phone", { width: 390, height: 844 });
await check("desktop", { width: 1280, height: 800 });
await browser.close().catch(() => {});
server.close();

if (problems.length) {
  console.error(`Page start check FAILED for ${path.join(root, pageName)}:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`Page start check passed: ${pageName} starts and stays responsive (phone and desktop, no internet).`);
process.exit(0);

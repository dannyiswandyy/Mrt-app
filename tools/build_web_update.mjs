#!/usr/bin/env node
/**
 * Generates web/web-update.json for instant over-the-air (OTA) web bundle updates
 * in the Android app from any HTTPS host (for example, Cloudflare Pages or Netlify Drop).
 *
 * Usage:
 *   node tools/build_web_update.mjs [--version 2026.11.27-1530]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WEB_DIR = path.join(ROOT, "web");
const OUT_FILE = path.join(WEB_DIR, "web-update.json");

const SAFE_REL = /^[A-Za-z0-9._/-]+$/;
const EXCLUDE = new Set(["sw.js", "web-update.json"]);

function sgVersionStamp(date = new Date()) {
  const sg = new Date(date.getTime() + 8 * 3600 * 1000);
  const pad = n => String(n).padStart(2, "0");
  return `${sg.getUTCFullYear()}.${pad(sg.getUTCMonth() + 1)}.${pad(sg.getUTCDate())}-${pad(sg.getUTCHours())}${pad(sg.getUTCMinutes())}`;
}

function parseVersionArg(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--version" && argv[i + 1]) return String(argv[i + 1]).trim();
    if (argv[i].startsWith("--version=")) return argv[i].slice("--version=".length).trim();
  }
  return "";
}

export function buildWebUpdateManifest({ webDir = WEB_DIR, version = "" } = {}) {
  const entries = fs.readdirSync(webDir, { withFileTypes: true });
  const files = [];

  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const name = ent.name;
    if (EXCLUDE.has(name)) continue;
    if (name !== "index.html" && name !== "tracker-ui.css" && !name.endsWith(".js")) continue;
    if (!SAFE_REL.test(name) || name.includes("..")) continue;
    const stat = fs.statSync(path.join(webDir, name));
    if (stat.size <= 0) continue;
    files.push(name);
  }

  files.sort((a, b) => {
    if (a === "index.html") return -1;
    if (b === "index.html") return 1;
    if (a === "tracker-ui.css") return -1;
    if (b === "tracker-ui.css") return 1;
    return a.localeCompare(b);
  });

  if (!files.includes("index.html")) {
    throw new Error("web/index.html is missing or empty");
  }

  const ver = version || sgVersionStamp();
  return { version: ver, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = parseVersionArg(process.argv.slice(2));
  const manifest = buildWebUpdateManifest({ version });
  fs.writeFileSync(OUT_FILE, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`Wrote ${path.relative(ROOT, OUT_FILE)} (version ${manifest.version}, ${manifest.files.length} files)`);
}

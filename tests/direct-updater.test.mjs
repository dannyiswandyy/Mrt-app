import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

test("build-android.yml is under 480 KB and wires direct HTTPS APK + OTA web updates", () => {
  const ymlPath = path.join(ROOT, ".github/workflows/build-android.yml");
  const stat = fs.statSync(ymlPath);
  assert.ok(stat.size < 480 * 1024, `build-android.yml is ${stat.size} bytes (must be < 480 KB)`);

  const yml = fs.readFileSync(ymlPath, "utf8");
  for (const token of [
    "UPDATE_URL",
    "setCustomUrl",
    "customHost",
    "otaFile",
    "otaNewer",
    "otaDownload",
    "installWebUpdate",
    "getUpdateUrl",
    "setUpdateUrl",
    "getOtaVersion",
    "resetWebUpdate",
    "window.webUpdateAvailable",
  ]) {
    assert.ok(yml.includes(token), `build-android.yml should include ${token}`);
  }

  assert.ok(!/\bUpdater\.enabled\(\s*\)/.test(yml), "Updater.enabled() must always receive Context");
});

test("web/web-update.json is valid and lists every local script in web/index.html", () => {
  const manifestPath = path.join(ROOT, "web/web-update.json");
  const raw = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(raw);

  assert.equal(typeof manifest.version, "string");
  assert.ok(manifest.version.trim().length > 0, "manifest.version must be non-empty");
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0, "manifest.files must be non-empty");
  assert.ok(manifest.files.includes("index.html"), "manifest.files must include index.html");
  assert.ok(manifest.files.length <= 64, "manifest.files must stay within Android MAX_OTA_FILES (64)");

  let totalBytes = 0;
  for (const rel of manifest.files) {
    assert.match(rel, /^[A-Za-z0-9._/-]+$/, `invalid OTA relative path: ${rel}`);
    assert.ok(!rel.includes("..") && !rel.startsWith("/"), `unsafe OTA path: ${rel}`);
    const full = path.join(ROOT, "web", rel);
    assert.ok(fs.existsSync(full), `manifest file missing in web/: ${rel}`);
    const sz = fs.statSync(full).size;
    assert.ok(sz > 0 && sz <= 8 * 1024 * 1024, `manifest file size out of bounds: ${rel} (${sz} bytes)`);
    totalBytes += sz;
  }
  assert.ok(totalBytes <= 30 * 1024 * 1024, `total OTA size (${totalBytes}) must stay under 30 MB`);

  const html = fs.readFileSync(path.join(ROOT, "web/index.html"), "utf8");
  const scriptSrcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
    .map(m => m[1])
    .filter(s => !/^https?:\/\//i.test(s));
  for (const src of scriptSrcs) {
    assert.ok(manifest.files.includes(src), `web/web-update.json must include local script ${src}`);
  }
});

test("web/index.html exposes OTA banner and direct HTTPS update URL controls in Settings", () => {
  const html = fs.readFileSync(path.join(ROOT, "web/index.html"), "utf8");
  for (const token of [
    "window.webUpdateAvailable",
    "APP.installWebUpdate",
    "APP.getUpdateUrl",
    "APP.setUpdateUrl",
    "APP.getOtaVersion",
    "APP.resetWebUpdate",
    "updUrlIn",
    "updUrlSave",
    "window.MRT_PRODUCTION=true;window.MRT_DEV_FEATURES=false;",
  ]) {
    assert.ok(html.includes(token), `web/index.html should contain ${token}`);
  }
});

test("public build, deploy, and timetable workflows target self-hosted Windows runner safely", () => {
  for (const rel of [
    ".github/workflows/build-android.yml",
    ".github/workflows/deploy-web.yml",
    ".github/workflows/timetable-check.yml",
  ]) {
    const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    assert.match(text, /runs-on:\s*(\[?self-hosted\b)/, `${rel} must run on self-hosted`);
    if (rel !== ".github/workflows/deploy-web.yml") {
      assert.ok(!text.includes("runs-on: ubuntu-latest"), `${rel} should not still reference ubuntu-latest`);
    }
    assert.ok(text.includes("shell: bash"), `${rel} must set bash shell for Git Bash on Windows`);
  }

  for (const rel of [".github/workflows/build-android.yml", ".github/workflows/deploy-web.yml"]) {
    const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    assert.ok(!text.includes("actions/setup-python@v5"), `${rel} should not rely on actions/setup-python@v5 MSI setup.ps1 on Windows`);
    assert.ok(text.includes("MRT-Python-3.12.10"), `${rel} must use cached portable Python 3.12.10`);
    assert.ok(
      text.includes("0EB85C2DFCCCCF1B17352DE4C397F69194035B7D37149EACC16F1147D93DE3B8"),
      `${rel} must verify portable Python 3.12.10 SHA-256 checksum`
    );
  }

  const ba = fs.readFileSync(path.join(ROOT, ".github/workflows/build-android.yml"), "utf8");
  assert.ok(!ba.includes("android-actions/setup-android"), "build-android.yml should not rely on android-actions/setup-android on Windows");
  assert.ok(ba.includes("MRT-AndroidSDK"), "build-android.yml must use cached MRT-AndroidSDK");

  const tt = fs.readFileSync(path.join(ROOT, ".github/workflows/timetable-check.yml"), "utf8");
  assert.ok(
    tt.includes("github.event.pull_request.head.repo.full_name == github.repository"),
    "timetable-check.yml must guard self-hosted runner against untrusted fork pull requests"
  );
});

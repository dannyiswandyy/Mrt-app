// Future MRT lines (future-lines.js): in the network like the RTS Link, not a separate overlay.
// The same test runs for the app page in android/app/src/main/assets or web/, whichever this repo has.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const dev = fs.existsSync(new URL("../android/app/src/main/assets/index.html", import.meta.url));
const dir = new URL(dev ? "../android/app/src/main/assets/" : "../web/", import.meta.url);
const page = fs.readFileSync(new URL("index.html", dir), "utf8");
const window = {};
vm.runInNewContext(fs.readFileSync(new URL("future-lines.js", dir), "utf8"), {window});
const F = window.MRT_FUTURE_LINES;

test("future-lines.js has lines, extensions, new stations on open lines and positions", () => {
  assert.ok(F && F.lines && F.extend && F.infill && F.pos);
  assert.ok(Object.keys(F.lines).length >= 6);
});

test("every future station is [code, name, opening, expected] and has a position", () => {
  const all = [...Object.values(F.lines), ...Object.values(F.extend), ...Object.values(F.infill)];
  for (const L of all) for (const st of L.stations){
    assert.equal(st.length, 4, JSON.stringify(st));
    assert.match(st[0], /^[A-Z]{2}\d{1,2}[A-Z]?$/, st[0]);
    assert.ok(st[1] && typeof st[1] === "string");
    assert.ok(st[2] === "TBA" || /^\d{4}-\d{2}-\d{2}$/.test(st[2]), st[0] + " opens TBA or on a date");
    assert.equal(typeof st[3], "string");
    const p = F.pos[st[0]];
    assert.ok(Array.isArray(p) && p.length === 2 && p.every(Number.isFinite), st[0] + " position");
  }
});

test("each new line has one track piece per pair of stations, joined up", () => {
  for (const [c, L] of Object.entries(F.lines)){
    assert.ok(L.stations.length >= 2, c);
    assert.equal(L.paths.length, L.stations.length - 1, c + " pieces");
    L.paths.forEach((f, i) => {
      assert.ok(Array.isArray(f) && f.length >= 4 && f.length % 2 === 0 && f.every(Number.isFinite), `${c} piece ${i}`);
      const a = F.pos[L.stations[i][0]], b = F.pos[L.stations[i + 1][0]];
      // the page pins each piece to its stations; a piece that starts or ends far from them is the wrong one
      assert.ok(Math.hypot(f[0] - a[0], f[1] - a[1]) < 800, `${c} piece ${i} starts at ${L.stations[i][0]}`);
      assert.ok(Math.hypot(f[f.length - 2] - b[0], f[f.length - 1] - b[1]) < 800, `${c} piece ${i} ends at ${L.stations[i + 1][0]}`);
    });
  }
  for (const [c, E] of Object.entries(F.extend)) assert.equal(E.paths.length, E.stations.length, c + " extension: a piece to each new station");
});

test("the page has its switch before the main script, and builds them into LINES and MAP", () => {
  const sw = page.indexOf("window.MRT_SHOW_FUTURE = "), data = page.indexOf('<script src="future-lines.js"></script>');
  const main = page.indexOf("/* ---------- Network data (as of");
  assert.ok(sw > 0 && data > sw && main > data, "switch, then data, then the main script");
  assert.equal(page.slice(sw, sw + 30).includes("true"), dev, dev ? "on in this build" : "off until approved");
  assert.match(page, /const FUTURE = window\.MRT_SHOW_FUTURE === true/);
  assert.match(page, /ORDER\.push\(c\)/);
  assert.match(page, /MAP\.paths\[c\] = L\.stations\.slice\(0, -1\)\.map/);
  assert.match(page, /if \(n < 2\) return extra;/, "no trains on a line that isn't open");
});

test("ChatGPT's separate future-rail layer is gone", () => {
  assert.doesNotMatch(page, /mrtFutureRail|future-rail\.js|future-station/);
  assert.ok(!fs.existsSync(new URL("future-rail.js", dir)));
});

if (dev) test("the app's timetable station list stays as tools/lines.json (no future stations)", () => {
  assert.match(page, /stations: LINES\[c\]\.stations\.filter\(x => x\[2\] !== "TBA"\)\.map\(x => \[x\[0\], x\[1\]\]\)/);
});

// TEL5 / DTL3e launch checks: activation, actual network/track data, and
// separation of pre-opening testing trains from passenger train displays.
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const page = fs.readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
const intelligence = fs.readFileSync(new URL("../web/mrt-intelligence.js", import.meta.url), "utf8");
const blocks = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
const main = blocks.map(m => m[1]).find(s => s.includes("const LINES = {") && s.includes("function activeStations("));
if (!main) throw new Error("Main MRT page script not found");
const ui = main.indexOf("/* ---------- UI ---------- */");
if (ui < 0) throw new Error("Model/UI boundary missing");
const sandbox = {window: {}, console};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(main.slice(0, ui) +
  "\n;globalThis.__opening = { LINES, OPEN_TEL5, activeStations };", sandbox);
const {LINES, OPEN_TEL5, activeStations} = sandbox.__opening;

test("TEL5 and DTL3e use the confirmed 26 December opening date", () => {
  assert.equal(OPEN_TEL5, "2026-12-26");
  assert.deepEqual(Array.from(LINES.TEL.stations.slice(-3).map(s=>s[0])), ["TE29", "TE30", "TE31"]);
  assert.deepEqual(Array.from(LINES.DTL.stations.slice(-3).map(s=>s[0])), ["DT35", "DT36", "DT37"]);
  assert.equal(LINES.TEL.stations.at(-1)[1], "Sungei Bedok");
  assert.equal(LINES.DTL.stations.at(-1)[1], "Sungei Bedok");
});

test("stations stay closed on 25 Dec and open on 26 Dec, with transfer on both lines", () => {
  const beforeTel = activeStations(LINES.TEL,"2026-12-25");
  const beforeDtl = activeStations(LINES.DTL,"2026-12-25");
  assert.equal(beforeTel.at(-1)[0],"TE29");
  assert.equal(beforeDtl.at(-1)[0],"DT35");
  for (const date of ["2026-12-26", "2026-12-27"]) {
    assert.equal(activeStations(LINES.TEL,date).at(-1)[0],"TE31");
    assert.equal(activeStations(LINES.DTL,date).at(-1)[0],"DT37");
    assert.equal(activeStations(LINES.TEL,date).at(-1)[1],
                 activeStations(LINES.DTL,date).at(-1)[1]);
  }
});

test("track and station map geometry include every extension piece", () => {
  const m = page.match(/^const MAP = (\{.*\});?\s*$/m);
  assert.ok(m, "network MAP JSON must be available for native and browser maps");
  const map = JSON.parse(m[1]);
  for (const code of ["TEL","DTL"]) {
    const stations = LINES[code].stations;
    const path = map.paths[code];
    assert.equal(path.length, stations.length - 1, code + " track pieces");
    for (const station of stations.slice(-3)) {
      assert.ok(map.stations[station[0]], station[0] + " coordinate");
      assert.ok(map.stations[station[0]].every(Number.isFinite), station[0] + " finite geometry");
    }
    for (const seg of path.slice(-2)) {
      assert.ok(Array.isArray(seg) && seg.length >= 4 && seg.length % 2 === 0, code + " final track geometry");
    }
  }
});

function loadGuard(testing=false) {
  const guard = intelligence.indexOf("/* TEL5 / DTL3e passenger-opening safeguard");
  assert.ok(guard >= 0, "opening safety module must be present");
  const fake = (code, iso) => {
    const first = code === "TEL" ? 26 : 33;
    const arr = [0, 120, 240, 360];
    const run = {s: 21600, tid: code+"_TEST_001", p: {f:first,d:1,arr,dep:arr,end:360,to:first+3}};
    const a=[run];a.code=code;return a;
  };
  const window = { LINES, ttTrips:fake, MRT_DEV_FEATURES:testing, mrtDevScenario:testing?{type:"testing"}:null };
  vm.runInNewContext(intelligence.slice(guard), {window, Date, console});
  return window;
}

test("pre-opening passenger runs cannot claim unopened stations", () => {
  const w = loadGuard();
  const tel = w.ttTrips("TEL","2026-12-25");
  const dtl = w.ttTrips("DTL","2026-12-25");
  assert.equal(tel[0].p.arr.length,2);
  assert.equal(tel[0].p.to,27); // Bayshore
  assert.equal(dtl[0].p.arr.length,2);
  assert.equal(dtl[0].p.to,34); // Expo
  assert.deepEqual(Array.from(tel[0].p.arr), [0,120]);
  assert.equal(w.mrtExtensionOpening.inspect("2026-12-25").lines.TEL.status,"NOT_OPEN");
});

test("on opening day, actual scheduled trips may reach both new terminals", () => {
  const w = loadGuard();
  assert.equal(w.ttTrips("TEL","2026-12-26")[0].p.arr.length,4);
  assert.equal(w.ttTrips("DTL","2026-12-26")[0].p.arr.length,4);
  const r = w.mrtExtensionOpening.inspect("2026-12-26");
  assert.equal(r.lines.TEL.gtfsTerminalTrips,1);
  assert.equal(r.lines.DTL.gtfsTerminalTrips,1);
  assert.equal(r.lines.TEL.status,"GTFS_SCHEDULED");
  assert.equal(r.lines.DTL.status,"GTFS_SCHEDULED");
});

test("Dev explicit testing mode may show unopened sections for experimentation", () => {
  const w = loadGuard(true);
  assert.equal(w.ttTrips("TEL","2026-12-25")[0].p.arr.length,4);
  assert.equal(w.ttTrips("DTL","2026-12-25")[0].p.arr.length,4);
});

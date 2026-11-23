// Contract shared by the public Android/web tracker and the private dev app.
// Run with node --test tests/dwell-sync.test.mjs.
import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";

const page = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
const planned = page.match(/function ttState\\(r, sec, clock\\)\\{[\\s\\S]*?\\n\\}/)?.[0];
const realtime = page.match(/function rtLivePosition\\(line, r, sec\\)\\{[\\s\\S]*?\\n\\}/)?.[0];
const doorClose = Number(page.match(/const DOOR_CLOSE\\s*=\\s*(\\d+(?:\\.\\d+)?)/)?.[1]);

test("train movement functions and shared door-close timing are present", () => {
  assert.ok(planned, "scheduled train-position function missing");
  assert.ok(realtime, "GTFS-Realtime train-position function missing");
  assert.equal(doorClose, 13.5);
});

test("GTFS arrival, dwell, door closing and departure hold correct train coordinates", () => {
  const fn = new Function("rtLivePosition", "DOOR_CLOSE", planned + ";return ttState")(() => null, doorClose);
  const run = {s: 0, p: {f: 2, d: 1, arr: [0, 160, 300], dep: [40, 200, 300], end: 300}};
  const before = fn(run, 39), doors = fn(run, 50), moving = fn(run, 54);
  assert.equal(before.idx, 2);
  assert.equal(before.at, true);
  assert.equal(doors.idx, 2);
  assert.equal(doors.at, true);
  assert.equal(doors.doors, true);
  assert.ok(moving.idx > 2 && moving.idx < 3, "train should resume between the stations");
  assert.equal(moving.at, false);
  assert.equal(fn(run, 160).idx, 3);
  assert.equal(fn(run, 180).at, true);
  assert.equal(fn(run, 205).doors, true);
  assert.equal(fn(run, 300).idx, 4);
});

test("reverse-direction services dwell and move in the correct direction", () => {
  const fn = new Function("rtLivePosition", "DOOR_CLOSE", planned + ";return ttState")(() => null, doorClose);
  const run = {s: 0, p: {f: 7, d: -1, arr: [0, 160], dep: [40, 160], end: 160}};
  assert.equal(fn(run, 50).idx, 7);
  assert.ok(fn(run, 54).idx < 7);
  assert.equal(fn(run, 160).idx, 6);
});

test("GTFS-Realtime departures also retain platform position during the closing cycle", () => {
  const make = new Function("rtState", "LINES", "DOOR_CLOSE", "Date", realtime + ";return rtLivePosition;");
  const data = {s: [
    ["NS1", null, null, null, null, 1000, 1040],
    ["NS2", null, null, null, null, 1160, 1180]
  ]};
  function positionAt(s) {
    const t = make({at:s * 1000, trips:{demo:data}}, {NSL:{stations:[["NS1"],["NS2"]]}},
      doorClose, {now:() => s * 1000});
    return t("NSL", {tid:"demo", p:{f:0,d:1,arr:[0,160],dep:[40,180]}}, s);
  }
  const held = positionAt(1050);
  assert.equal(held.idx, 0);
  assert.equal(held.at, true);
  assert.equal(held.doors, true);
  const moving = positionAt(1054);
  assert.ok(moving.idx > 0 && moving.idx < 1);
  assert.equal(moving.at, false);
});

// Trains at unusual hours must show while they run, whichever day LTA's timetable puts them on. The app counts
// midnight to 3am as the day before, so an event's early trains dated the next day ("02:30:00", like the 6 Dec 2026
// marathon) or an all-night service dated the day before ("26:30:00") would otherwise be missed for part of the night.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
const a = html.indexOf("/* One service day's own runs on a line"), b = html.indexOf("/* Extended-service nights:", a);
assert.ok(a >= 0 && b > a, "the page's day runs code is there");
const code = html.slice(a, b);

// a line with one service per day; trips are [start s, service, id], each run 3600 s long
function page(trips, now) {
  const days = {"2026-12-05": 0, "2026-12-06": 1, "2026-12-12": 2, "2026-12-13": 3};
  const ctx = {
    SIM: {est: false}, EXT_LAST: {}, ttDayCache: {},
    TT: {lines: {NSL: {trips: trips.map(([s, svc, id]) => [s, 0, svc, id]), P: [{f: 0, d: 1, arr: [0, 3600], dep: [0, 3600], end: 3600, to: 1}]}}},
    ttServices: iso => new Set([days[iso]]),
    simAddDays: (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10),
    sgNow: () => now.v
  };
  vm.runInNewContext(code + "; this.ttTrips = ttTrips; this.ttTripsDay = ttTripsDay;", ctx);
  return ctx;
}
const ids = list => JSON.parse(JSON.stringify((list || []).map(r => [r.tid, r.s])));   // plain arrays (the page runs in its own context)

test("early trains dated the next day (02:30:00) show from midnight, once", () => {
  const now = {v: {iso: "2026-12-05", mins: 24 * 60 + 35}};
  const p = page([[80000, 0, "SAT_LATE"], [9000, 1, "SUN_EARLY"], [21600, 1, "SUN_FIRST"]], now);
  const list = p.ttTrips("NSL", "2026-12-05");
  assert.deepEqual(ids(list), [["SAT_LATE", 80000], ["SUN_EARLY", 95400]]);
  assert.equal(p.ttTrips("NSL", "2026-12-05"), list, "kept, not rebuilt on every call");
  assert.deepEqual(ids(p.ttTrips("NSL", "2026-12-06")), [["SUN_EARLY", 9000], ["SUN_FIRST", 21600]], "the other day is its own runs");
  now.v = {iso: "2026-12-05", mins: 22 * 60};
  assert.deepEqual(ids(p.ttTrips("NSL", "2026-12-05")), [["SAT_LATE", 80000]], "before midnight: the day's own runs");
});

test("all-night trains dated the day before (26:30:00) still show after 3am", () => {
  const now = {v: {iso: "2026-12-06", mins: 3 * 60 + 20}};
  const p = page([[95400, 0, "SAT_NIGHT"], [86000, 0, "SAT_LAST"], [21600, 1, "SUN_FIRST"]], now);
  assert.deepEqual(ids(p.ttTrips("NSL", "2026-12-06")), [["SAT_NIGHT", 9000], ["SUN_FIRST", 21600]]);
  now.v = {iso: "2026-12-06", mins: 13 * 60};
  assert.deepEqual(ids(p.ttTrips("NSL", "2026-12-06")), [["SUN_FIRST", 21600]], "after noon: the day's own runs");
});

test("any date works, and a day with no trains of its own gets the early ones", () => {
  const now = {v: {iso: "2026-12-12", mins: 24 * 60 + 50}};
  const p = page([[10000, 3, "SUN_13_EARLY"]], now);
  assert.deepEqual(ids(p.ttTrips("NSL", "2026-12-12")), [["SUN_13_EARLY", 96400]]);
  assert.equal(p.ttTripsDay("NSL", "2026-12-12"), null);
});

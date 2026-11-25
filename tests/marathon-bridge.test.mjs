// The marathon's early trains (Sun 6 Dec 2026, 02:30-04:30) must show all through the window, whichever way
// LTA's timetable gives them: on Sunday's service day (02:30:00) or on Saturday's (26:30:00). The page counts
// 00:00-02:59 as the day before, so the bridge in mrt-intelligence.js brings the other day's trains over.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const src = fs.readFileSync(new URL("../web/mrt-intelligence.js", import.meta.url), "utf8");
const start = src.indexOf("/* Early-morning bridge for the marathon");
assert.ok(start >= 0, "marathon bridge is installed");
const end = src.indexOf("})(typeof window", start);
const bridge = src.slice(start, src.indexOf("\n", end) + 1);

function load(days, now) {
  const run = (s, end, tid) => ({s, pi: 0, tid, p: {end}});
  const lists = {};
  for (const [iso, runs] of Object.entries(days)) { const l = runs.map(r => run(...r)); l.code = "NSL"; lists[iso] = l; }
  const window = {ttTrips: (code, iso) => code === "NSL" ? lists[iso] || null : null, sgNow: () => now.v};
  vm.runInNewContext(bridge, {window});
  return window.ttTrips;
}
const at = (iso, mins) => ({v: {iso, mins}});

test("Sunday-dated trains (02:30:00) also show before 3am, once, on Saturday's service day", () => {
  const now = at("2026-12-05", 24 * 60 + 35);
  const tt = load({"2026-12-06": [[9000, 3600, "NSL_MARATHON_1"], [21600, 3600, "NSL_SUN_FIRST"]], "2026-12-05": [[80000, 3600, "NSL_SAT"]]}, now);
  const sat = tt("NSL", "2026-12-05");
  assert.deepEqual(sat.map(r => [r.tid, r.s]), [["NSL_SAT", 80000], ["NSL_MARATHON_1", 95400]]);
  assert.equal(tt("NSL", "2026-12-05"), sat, "the combined list is kept, not rebuilt on every call");
  now.v = {iso: "2026-12-06", mins: 200};
  assert.equal(tt("NSL", "2026-12-06").length, 2, "from 3am Sunday's own list has them");
});

test("Saturday-dated trains (26:30:00) still show after 3am, on Sunday's service day", () => {
  const now = at("2026-12-06", 3 * 60 + 20);
  const tt = load({"2026-12-05": [[95400, 3600, "NSL_MARATHON_1"], [90000, 1000, "NSL_SAT_LAST"]], "2026-12-06": [[21600, 3600, "NSL_SUN_FIRST"]]}, now);
  assert.deepEqual(tt("NSL", "2026-12-06").map(r => [r.tid, r.s]), [["NSL_MARATHON_1", 9000], ["NSL_SUN_FIRST", 21600]]);
  now.v = {iso: "2026-12-06", mins: 8 * 60};
  assert.equal(tt("NSL", "2026-12-06").length, 1, "after 7am only Sunday's own trains");
});

test("other days, lines and times are left alone", () => {
  const now = at("2026-12-12", 24 * 60 + 35);
  const tt = load({"2026-12-13": [[9000, 3600, "NSL_X"]], "2026-12-12": [[80000, 3600, "NSL_Y"]]}, now);
  assert.equal(tt("NSL", "2026-12-12").length, 1);
  assert.equal(tt("NEL", "2026-12-05"), null);
});

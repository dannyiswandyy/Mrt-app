// GTFS must supply actual special train trips; an event announcement is not a timetable.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const src = fs.readFileSync(new URL("../web/mrt-intelligence.js", import.meta.url), "utf8");
const tag = "/* MRT SPECIAL EVENT OPERATIONS (shared production-safe module) */";
assert.ok(src.includes(tag), "special events module is installed");
const root = {};
vm.runInNewContext(src.slice(src.indexOf(tag)), { window: root, Date });
const E = root.mrtSpecialEvents;
assert.ok(E);

const m = E.MARATHON;
assert.equal(m.date, "20261206");
assert.deepEqual(Array.from(m.lines), ["NSL", "EWL", "CCL"]);

const pack = () => ({
  feed: { built: "2026-12-02" },
  services: [
    ["SUN", "0000001", "20261201", "20261231"],
    ["SAT", "0000010", "20261201", "20261231"],
    ["EXTRA", "0000000", "20261201", "20261231"]
  ],
  except: {},
  lines: {
    NSL: { pats: [[0, 1, [0, 120], [0, 120], 1]], trips: [
      [9000, 0, 0, "NSL_SB_WE_101_001"],           // Sunday 02:30
      [95400, 0, 1, "NSL_SB_WE_201_001"],          // Saturday 26:30
      [21600, 0, 0, "NSL_SB_WE_301_001"],           // normal 06:00, not in window
      [9000, 0, 2, "NSL_SB_WE_SPECIAL_401_001"]     // excluded until added by exception
    ]},
    EWL: { pats: [[0, 1, [0, 120], [0, 120], 1]], trips: [] },
    CCL: { pats: [[0, 1, [0, 120], [0, 120], 1]], trips: [] },
    NEL: { pats: [[0, 1, [0, 120], [0, 120], 1]], trips: [[9000, 0, 0, "NEL_WE_501_001"]] }
  }
});

test("Sunday 02:30 and Saturday 26:30 are both recognised, but not fabricated", () => {
  const r = E.inspect(pack());
  assert.equal(r.trips.length, 2);
  assert.deepEqual(Array.from(r.trips.map(t => t.run)).sort(), ["101", "201"]);
  assert.equal(r.proof, "GTFS_SCHEDULED_TRIPS_IN_WINDOW");
  assert.equal(E.minusDay("20261206"), "20261205");
  assert.ok(r.trips.every(t => t.time === 9000));
});

test("calendar_dates exclusions and additions determine exactly which trips appear", () => {
  const tt = pack();
  tt.except["20261206"] = [[0, 2], [2, 1]];
  const r = E.inspect(tt);
  assert.deepEqual(Array.from(r.trips.map(t => t.run)).sort(), ["201", "401"]);
});

test("absence of LTA timetable never creates fictional 15-minute departures", () => {
  const r = E.inspect(null);
  assert.equal(r.proof, "OPERATOR_ANNOUNCEMENT_ONLY");
  assert.equal(r.trips.length, 0);
  assert.equal(r.timetablePresent, false);
  assert.equal(m.announcedHeadwayMinutes, 15);
});

test("only announced rail lines are inspected", () => {
  const r = E.inspect(pack());
  assert.equal(r.trips.some(t => t.line === "NEL"), false);
  assert.deepEqual(Object.keys(r.countByLine).sort(), ["CCL", "EWL", "NSL"]);
});


// The early-trains bridge is now the page's own ttTrips, for every day and line (tests/overnight-trains.test.mjs
// checks it in full); these two checks run against the page's code.
const pageHtml = fs.readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
const dayCode = pageHtml.slice(pageHtml.indexOf("/* One service day's own runs on a line"), pageHtml.indexOf("/* Extended-service nights:"));
function pageTrips(byDay, now) {
  const days = Object.keys(byDay), lines = {};
  for (const code of ["NSL", "NEL"]) lines[code] = {P: [{f: 0, d: 1, arr: [0, 120], dep: [0, 120], end: 120, to: 1}],
    trips: days.flatMap((iso, i) => (byDay[iso][code] || []).map(([s, tid]) => [s, 0, i, tid]))};
  const ctx = {SIM: {est: false}, EXT_LAST: {}, ttDayCache: {}, TT: {lines}, ttServices: iso => new Set([days.indexOf(iso)]), sgNow: () => now};
  vm.runInNewContext(dayCode + "; this.ttTrips = ttTrips;", ctx);
  return ctx.ttTrips;
}

test("line-board/map bridge shows LTA Sunday 02:30 runs during Saturday 26:30", () => {
  const tt = pageTrips({"2026-12-05": {NSL: [[95400, "SAT"]], NEL: [[80000, "NEL_SAT"]]}, "2026-12-06": {NSL: [[9000, "SUN"]]}},
    {iso: "2026-12-05", mins: 1590});
  const shown = tt("NSL", "2026-12-05");
  assert.deepEqual(Array.from(shown.map(t => t.tid)), ["SAT", "SUN"]);
  assert.deepEqual(Array.from(shown.map(t => t.s)), [95400, 95400]);
  assert.deepEqual(Array.from(tt("NEL", "2026-12-05").map(t => t.tid)), ["NEL_SAT"], "a line without early trains is unchanged");
  assert.deepEqual(Array.from(tt("NSL", "2026-12-06").map(t => [t.tid, t.s])).flat(), ["SUN", 9000], "Sunday's own timetable is unchanged");
});

test("no early Sunday trains means no fabricated map trains", () => {
  const tt = pageTrips({"2026-12-05": {}, "2026-12-06": {}}, {iso: "2026-12-05", mins: 1590});
  assert.equal(tt("NSL", "2026-12-05"), null);
});

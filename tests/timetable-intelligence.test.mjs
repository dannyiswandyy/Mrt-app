import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const isDev = Boolean(process.env.MRT_INDEX);
const src = readFileSync(new URL(isDev
  ? "../android/app/src/main/assets/timetable-intelligence.js"
  : "../web/timetable-intelligence.js", import.meta.url), "utf8");

const makeTT = () => ({
  feed: { built: "2026-11-22" },
  services: [["SERVICE_PH", "0000001", "20260101", "20261231"]],
  except: {},
  lines: {
    CCL: {
      pats: [
        [0, 1, [0, 120, 240], [0, 150, 240], 2],
        [1, 1, [0, 120, 240], [0, 150, 240], 3]
      ],
      trips: [
        [21600, 0, 0, "CCL_Clockwise_PH_0030_0001"],
        [25200, 1, 0, "CCL_Clockwise_PH_0030_0002"]
      ]
    },
    BP: {
      pats: [[0, 1, [0, 120], [0, 120], 1]],
      trips: [
        [22000, 0, 0, "BPLRT_A_PH_1"],
        [23000, 0, 0, "BPLRT_A_PH_2"]
      ]
    }
  }
});
function app(TT) {
  const local = new Map();
  const window = {addEventListener() {}};
  const document = {readyState:"loading", addEventListener(){}, hidden:false};
  vm.runInNewContext(src, {window, document, TT, LINES: {
    CCL: {stations:[["CC1","Dhoby Ghaut"],["CC2","Bras Basah"],["CC3","Esplanade"],["CC4","Promenade"]]},
    BP: {stations:[["BP1","Choa Chu Kang"],["BP2","South View"]]}
  }, localStorage: {
    getItem: k => local.get(k) ?? null,
    setItem: (k,v) => local.set(k,v)
  }, setInterval() {}}, {filename:"timetable-intelligence.js"});
  return window.mrtTimetableIntelligence;
}

test("CCL duties detect consecutive changing routes without pretending to know trainsets", () => {
  const api=app(makeTT()), day=api.inspectDay("CCL", "2026-11-22");
  assert.equal(day.trips,2);
  assert.equal(day.runs,1);
  assert.equal(day.varied.length,1);
  assert.equal(day.varied[0].slot,"030");
  assert.equal(day.varied[0].routes.length,2);
  assert.match(day.evidence,/not real-time train movements/);
});
test("LRT trip numbers remain trips, not invented duty/vehicle identifiers", () => {
  const api=app(makeTT()), day=api.inspectDay("BP", "2026-11-22");
  assert.equal(day.trips,2);
  assert.equal(day.runs,0);
  assert.equal(day.isLrt,true);
  assert.equal(day.patterns.length,1);
  assert.equal(day.patterns[0].pattern,"A");
  assert.equal(day.patterns[0].count,2);
  for (const code of ["BP","SE","SW","PE","PW","CCL","NSL","EWL","CG","NEL","DTL","TEL"]) {
    assert.ok(api.coverage.includes(code));
  }
});
test("GTFS changes to intermediate stop times change the per-line fingerprint", () => {
  const original=makeTT(), changed=makeTT(), api=app(original);
  changed.lines.CCL.pats[0][2][1]+=15;
  const diff=api.compare(api.fingerprint(original),api.fingerprint(changed));
  assert.ok(diff.some(x=>x.line==="CCL"));
});
test("dated service cancellation excludes that day's trips", () => {
  const tt=makeTT();
  tt.except["20261122"]=[[0,2]];
  const api=app(tt);
  assert.equal(api.inspectDay("CCL","2026-11-22").trips,0);
  assert.equal(api.inspectDay("BP","2026-11-22").trips,0);
});
test("independent roster conflicts are flagged without replacing LTA trips", () => {
  const api=app(makeTT());
  const result=api.compareRoster("CCL","2026-11-22");
  assert.match(result.source,/User-supplied/);
  assert.ok(result.missing.some(r=>r.slot==="030"));
  assert.equal(api.inspectDay("CCL","2026-11-22").trips,2);
});

test("trip-specific termini include short-turn MRT, LRT loop and Circle Line patterns", () => {
  const page = readFileSync(new URL(isDev
    ? "../android/app/src/main/assets/index.html"
    : "../web/index.html", import.meta.url), "utf8");
  const from = page.indexOf("/* Each LTA trip carries its own scheduled end station.");
  const to = page.indexOf("/* Minutes NSL trains", from);
  assert.ok(from >= 0 && to > from, "dynamic terminus helpers are present");
  const helpers = vm.runInNewContext(page.slice(from, to) + "\n({isShortTo, destOf})", {
    dest: (line, dir, stations) => line.bound ? line.bound[dir] : line.loop ? "Loop via hub" : stations[dir ? 0 : stations.length-1][1],
    endsName: (line, dir, stations, end) => stations[end][1]
  });
  const mrt = [["NS1", "Jurong East"], ["NS14", "Khatib"], ["NS28", "Marina South Pier"]];
  assert.equal(helpers.destOf({}, 0, mrt, 1), "Khatib");
  assert.equal(helpers.isShortTo({}, 0, mrt, 2), false);
  const loop = [["STC", "Sengkang"], ["SW2", "Farmway"], ["STC", "Sengkang"]];
  assert.equal(helpers.destOf({loop:true, lrt:true}, 0, loop, 1), "Farmway");
  assert.equal(helpers.isShortTo({loop:true, lrt:true}, 0, loop, 2), false);
  assert.equal(helpers.isShortTo({loop:true, lrt:true}, 0, loop, 0), false);
  const ccl = [["CC1", "Dhoby Ghaut"], ["CC6", "Stadium"], ["CC4", "Promenade"]];
  assert.equal(helpers.destOf({bound:["Anticlockwise","Clockwise"]}, 0, ccl, 1), "Stadium");
  assert.equal(helpers.isShortTo({bound:["Anticlockwise","Clockwise"]}, 0, ccl, -1), false);
});

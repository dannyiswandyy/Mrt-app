import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { mainScript } = require("./load-page.js");

const root = path.resolve(import.meta.dirname, "..");
const html = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
const ttRawText = fs.readFileSync(path.join(root, "data/lta-timetable.json"), "utf8");
const ttRaw = JSON.parse(ttRawText);
const linesJson = JSON.parse(fs.readFileSync(path.join(root, "tools/lines.json"), "utf8"));

const ALL_LTA_LINES = ["NSL", "EWL", "NEL", "CCL", "DTL", "TEL", "CG", "BP", "SE", "SW", "PE", "PW"];

function makeEl() {
  return {
    style: { setProperty() {}, getPropertyValue() { return ""; }, removeProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    dataset: {},
    hidden: false,
    children: [],
    innerHTML: "",
    textContent: "",
    value: "",
    className: "",
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll: () => [],
    closest() { return makeEl(); },
    appendChild() {},
    removeChild() {},
    setAttribute() {},
    getAttribute() { return ""; },
    removeAttribute() {},
    getBoundingClientRect() { return { width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600 }; },
    focus() {},
    click() {},
  };
}

function bootWithTT(nowIso = "2026-11-26T08:30:00+08:00") {
  const src = mainScript(html);
  const nowMs = Date.parse(nowIso);
  const PageDate = class extends Date {
    constructor(...a) { super(...(a.length ? a : [nowMs])); }
    static now() { return nowMs; }
  };
  const document = {
    getElementById: makeEl,
    querySelector: makeEl,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: makeEl,
    documentElement: makeEl(),
    body: makeEl(),
    hidden: false,
    title: "",
    fonts: { ready: new Promise(() => {}) },
  };
  const sandbox = {
    document,
    console,
    setTimeout() { return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    requestAnimationFrame() { return 0; },
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    Map, Set, WeakMap, Promise, Date: PageDate, Math, JSON, Object, Array, Number, String,
    Boolean, RegExp, Error, Symbol, parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent, URL, URLSearchParams, atob, btoa, Intl,
    fetch: async () => { throw new Error("offline test"); },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    navigator: {},
    location: { hash: "", protocol: "http:", hostname: "localhost", href: "http://localhost/" },
    history: { pushState() {}, back() {}, replaceState() {} },
    addEventListener() {},
    removeEventListener() {},
    MrtApp: {
      getTimetable: () => ttRawText,
      timetableStations: () => {},
    },
    MRT_PRODUCTION: true,
    MRT_DEV_FEATURES: false,
    MRT_SHOW_FUTURE: false,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  try {
    vm.runInContext(src, sandbox, { filename: "mrt-main.js" });
  } catch (e) {
    // UI bootstrap after model definitions expects real DOM widgets.
  }

  return {
    sandbox,
    api: vm.runInContext(`({
      LINES, SLOW, SEG, TT, SIM, legCache,
      activeStations, ttSegFor, legsOf, ttTrips, ttTripsDay, ttAt, ttStopK, ttNext,
      ttTrainsOn, dayCalls, nextArrivals, nextArrivalsBase, dayOf, dayBase,
      usesTT, trainShuttleInfo, trainSVG
    })`, sandbox),
  };
}

function makeNow(isoDate, mins, sec = 0) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const dow = dt.getUTCDay();
  const weekend = dow === 0 || dow === 6;
  return {
    iso: isoDate,
    dow,
    weekend,
    mins: mins + sec / 60,
    s: mins * 60 + sec,
    day: dow === 0 ? "sun" : dow === 6 ? "sat" : "wk",
  };
}

function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}

test("all 12 LTA lines match tools/lines.json stations and have zero-offset non-decreasing GTFS patterns", () => {
  const { api } = bootWithTT();
  assert.ok(api.TT, "TT must load via MrtApp.getTimetable()");
  assert.deepEqual(Object.keys(api.SLOW), [], "SLOW must be empty so no line lags behind LTA GTFS");

  for (const code of ALL_LTA_LINES) {
    assert.ok(api.LINES[code], `LINES missing ${code}`);
    assert.ok(ttRaw.lines[code], `lta-timetable.json missing ${code}`);
    assert.ok(api.TT.lines[code], `parsed TT missing ${code}`);
    assert.equal(api.usesTT(code), true, `${code} must actively use LTA timetable`);

    const pageCodes = Array.from(api.LINES[code].stations.map(s => s[0]));
    const toolCodes = linesJson[code].stations.map(s => s[0]);
    assert.deepEqual(pageCodes, toolCodes, `${code} station codes must match tools/lines.json`);

    const rawLine = ttRaw.lines[code];
    const parsedLine = api.TT.lines[code];
    assert.equal(parsedLine.P.length, rawLine.pats.length, `${code} pattern count mismatch`);

    const ccLast = code === "CCL" ? pageCodes.length - 1 : -1;
    for (let pi = 0; pi < rawLine.pats.length; pi++) {
      const [f, d, rawArr, rawDep, h] = rawLine.pats[pi];
      const p = parsedLine.P[pi];
      const isCclClosing = ccLast > 0 && d > 0 && f + rawArr.length - 1 === ccLast - 1 && (h == null || h < 0 || h === ccLast - 1);
      assert.equal(p.arr.length, rawArr.length + (isCclClosing ? 1 : 0), `${code} pat ${pi} arr length mismatch`);
      assert.equal(p.dep.length, rawDep.length + (isCclClosing ? 1 : 0), `${code} pat ${pi} dep length mismatch`);

      for (let k = 0; k < rawArr.length; k++) {
        const stIdx = f + d * k;
        assert.ok(stIdx >= 0 && stIdx < pageCodes.length, `${code} pat ${pi} stIdx=${stIdx} out of bounds`);
        assert.equal(p.arr[k], rawArr[k], `${code} pat ${pi} k=${k} arr offset must be 0`);
        assert.equal(p.dep[k], rawDep[k], `${code} pat ${pi} k=${k} dep offset must be 0`);
        assert.ok(p.dep[k] >= p.arr[k], `${code} pat ${pi} k=${k} dep < arr`);
        if (k > 0) assert.ok(p.arr[k] >= p.dep[k - 1], `${code} pat ${pi} k=${k} non-monotonic`);
      }
    }
  }
});

test("all 12 LTA lines render every active LTA trip in ttTrainsOn with zero ETA drift across the day", () => {
  const { api } = bootWithTT();
  const sampleMins = [6 * 60, 8 * 60 + 30, 12 * 60 + 30, 18 * 60 + 30, 22 * 60 + 30, 23 * 60 + 45];

  for (const code of ALL_LTA_LINES) {
    for (const mins of sampleMins) {
      const now = makeNow("2026-11-26", mins);
      const sec = now.mins * 60;
      const list = api.ttTrips(code, now.iso);
      assert.ok(list && list.length > 0, `${code} missing ttTrips on ${now.iso}`);

      const expected = list.filter(r => sec >= r.s && sec <= r.s + r.p.end);
      const trains = api.ttTrainsOn(code, now, list);
      assert.ok(trains, `${code} ttTrainsOn returned null at ${mins}m`);
      const byTid = new Map(trains.filter(tr => tr.ref).map(tr => [tr.ref.tid, tr]));

      for (const r of expected) {
        assert.ok(byTid.has(r.tid), `${code} at ${mins}m: active LTA trip ${r.tid} missing from ttTrainsOn`);
      }
      for (const tr of trains) {
        const r = tr.ref;
        assert.ok(r, `${code} at ${mins}m: ttTrainsOn emitted train without LTA ref`);
        assert.ok(tr.eta >= 0, `${code} negative ETA ${tr.eta}`);
        assert.ok(Number.isFinite(tr.idx), `${code} non-finite train idx`);
        if (!tr.layover) {
          assert.equal(tr.lag, 0, `${code} trip ${r.tid} lag must be 0s, got ${tr.lag}`);
          const k = (tr.next - r.p.f) * r.p.d;
          if (k >= 0 && k < r.p.arr.length) {
            const schedEtaMin = Math.max(0, (r.s + r.p.arr[k] - sec) / 60);
            assert.ok(
              Math.abs(tr.eta - schedEtaMin) <= 0.05,
              `${code} trip ${r.tid} ETA drift: got ${tr.eta.toFixed(3)}m vs LTA ${schedEtaMin.toFixed(3)}m`
            );
          }
        }
      }
    }
  }
});

test("CCL loop calls at CC32 Prince Edward Rd and CC4 Promenade match LTA departures without double-counting or drops", () => {
  const { api } = bootWithTT();
  const now = makeNow("2026-11-26", 8 * 60);

  // CC32 Prince Edward Road (idx=30, dir=1): loop-closing arrivals must NOT double-count as departures.
  const cc32Calls = api.dayCalls("CCL", 30, 1, now);
  assert.equal(cc32Calls.length, 387, `CCL CC32 dir=1 weekday calls should be 387, got ${cc32Calls.length}`);

  // CC4 Promenade (idx=3, dir=1): must include both CC4@3 -> CC1 (243) and CC4@33 -> CC34/CC33/CC32 (249) = 492.
  const cc4Calls = api.dayCalls("CCL", 3, 1, now);
  assert.equal(cc4Calls.length, 492, `CCL CC4 dir=1 weekday calls should be 492, got ${cc4Calls.length}`);

  // Verify every station on all 12 lines has dayCalls sorted in non-decreasing time order.
  for (const code of ALL_LTA_LINES) {
    const n = api.activeStations(api.LINES[code], now.iso).length;
    for (let i = 0; i < n; i++) {
      for (const dir of [0, 1]) {
        const calls = api.dayCalls(code, i, dir, now);
        for (let k = 1; k < calls.length; k++) {
          assert.ok(calls[k].m >= calls[k - 1].m, `${code} idx=${i} dir=${dir} calls not sorted`);
        }
      }
    }
  }
});

test("all 12 LTA lines legsOf(TT) and static SEG match actual LTA GTFS full-trip end-to-end medians", () => {
  const { api } = bootWithTT();
  const now = makeNow("2026-11-26", 12 * 60);

  for (const code of ALL_LTA_LINES) {
    const L = api.LINES[code];
    const n = api.activeStations(L, now.iso).length;
    const rawLine = ttRaw.lines[code];

    // Weight patterns by total scheduled runs across all services.
    const counts = new Array(rawLine.pats.length).fill(0);
    for (const svc of Object.keys(rawLine.trips)) {
      for (const run of rawLine.trips[svc]) counts[run[1]]++;
    }

    for (const dir of [0, 1]) {
      const startIdx = dir === 0 ? 0 : n - 1;
      const endIdx = dir === 0 ? n - 1 : 0;
      const durs = [];
      for (let pi = 0; pi < rawLine.pats.length; pi++) {
        const [f, d, arr] = rawLine.pats[pi];
        if (!counts[pi] || arr.length < 2) continue;
        if ((dir === 0 && d !== 1) || (dir === 1 && d !== -1)) continue;
        const lastIdx = f + d * (arr.length - 1);
        if (f === startIdx && lastIdx === endIdx) {
          const durMin = (arr[arr.length - 1] - arr[0]) / 60;
          for (let c = 0; c < counts[pi]; c++) durs.push(durMin);
        }
      }
      if (!durs.length) continue;
      const ltaMed = median(durs);

      // 1. With TT loaded (dynamic ttSegFor)
      api.SIM.est = false;
      const ttLegs = api.legsOf(code, dir, n);
      const ttTotal = ttLegs.off[n - 1];
      assert.ok(
        Math.abs(ttTotal - ltaMed) <= 0.6,
        `${code} dir=${dir} legsOf(TT)=${ttTotal.toFixed(2)}m diverges from LTA median=${ltaMed.toFixed(2)}m`
      );

      // 2. Estimated fallback (static SEG table)
      api.SIM.est = true;
      const segLegs = api.legsOf(code, dir, n);
      const segTotal = segLegs.off[n - 1];
      assert.ok(
        Math.abs(segTotal - ltaMed) <= 0.6,
        `${code} dir=${dir} static SEG=${segTotal.toFixed(2)}m diverges from LTA median=${ltaMed.toFixed(2)}m`
      );
    }
    api.SIM.est = false;
  }
});

test("nextArrivals preserves phase in late-night merge window and computes exact LTA ride duration", () => {
  const { api } = bootWithTT("2026-11-26T22:30:00+08:00");
  const lateNow = makeNow("2026-11-26", 22 * 60 + 30);

  for (const code of ALL_LTA_LINES) {
    const n = api.activeStations(api.LINES[code], lateNow.iso).length;
    const fromIdx = Math.min(1, n - 2);
    const toIdx = Math.min(fromIdx + 2, n - 1);
    const arr = api.nextArrivals(code, fromIdx, 0, lateNow, 3, toIdx);
    if (!arr.length) continue;

    assert.ok(Array.isArray(arr.phase), `${code} late-night nextArrivals must keep .phase array`);
    assert.equal(arr.phase.length, arr.length, `${code} .phase length mismatch`);
    assert.ok(Array.isArray(arr.ride), `${code} nextArrivals with reach must provide .ride array`);
    assert.ok(arr.ride[0] > 0, `${code} .ride[0] must be > 0, got ${arr.ride[0]}`);
  }
});

test("shuttle service badges identify BPLRT Shuttle A/B, Changi Airport Shuttle, and CCL Dhoby Ghaut–Stadium Shuttle", () => {
  const { api } = bootWithTT("2026-11-26T08:30:00+08:00");
  const now = makeNow("2026-11-26", 8 * 60 + 30);

  // BPLRT: both Shuttle A (via Senja) and Shuttle B (via Petir) are identified accurately across all active trips.
  const bpTrains = api.ttTrainsOn("BP", now, api.ttTrips("BP", now.iso));
  assert.ok(bpTrains.length > 0, "BP must have active trains at 08:30");
  const bpBadges = new Set();
  for (const tr of bpTrains) {
    const sh = api.trainShuttleInfo("BP", tr);
    assert.ok(sh, `BP train ${tr.ref.tid} must have shuttle info`);
    if (/^BPLRT_A_/i.test(tr.ref.tid)) {
      assert.equal(sh.code, "A");
      assert.equal(sh.label, "Shuttle A");
    } else if (/^BPLRT_B_/i.test(tr.ref.tid)) {
      assert.equal(sh.code, "B");
      assert.equal(sh.label, "Shuttle B");
    }
    bpBadges.add(sh.code);
  }
  assert.deepEqual([...bpBadges].sort(), ["A", "B"], "BP at 08:30 must show both Shuttle A and Shuttle B");

  // Changi Airport Branch (CG): all trains show Shuttle ("SH").
  const cgTrains = api.ttTrainsOn("CG", now, api.ttTrips("CG", now.iso));
  assert.ok(cgTrains.length > 0, "CG must have active trains at 08:30");
  for (const tr of cgTrains) {
    const sh = api.trainShuttleInfo("CG", tr);
    assert.ok(sh && sh.code === "SH" && sh.label === "Shuttle", "CG trains must show Shuttle badge");
  }

  // Circle Line (CCL): CC1 <-> CC6 shuttle trips show "SH", while full-loop trains do not.
  const cclRuns = api.ttTrips("CCL", now.iso);
  const cclShuttle = cclRuns.find(r => (r.p.f === 0 && r.p.d === 1 && r.p.arr.length === 6) || (r.p.f === 5 && r.p.d === -1 && r.p.arr.length === 6));
  const cclLoop = cclRuns.find(r => r.p.arr.length > 20);
  assert.ok(cclShuttle && cclLoop, "CCL must have both CC1-CC6 shuttle and full-loop runs");
  assert.equal(api.trainShuttleInfo("CCL", { ref: cclShuttle })?.code, "SH");
  assert.equal(api.trainShuttleInfo("CCL", { ref: cclLoop }), null);

  // Regular mainline trains (NSL) do not carry a shuttle badge.
  const nslTrains = api.ttTrainsOn("NSL", now, api.ttTrips("NSL", now.iso));
  assert.ok(nslTrains.length > 0);
  assert.equal(api.trainShuttleInfo("NSL", nslTrains[0]), null);

  // SVG fallback also embeds the badge text directly on the train icon.
  assert.ok(api.trainSVG(0, "shuttle", "A").includes(">A</text>"));
  assert.ok(api.trainSVG(1, "shuttle", "B").includes(">B</text>"));
  assert.ok(api.trainSVG(0, "shuttle", "SH").includes(">SH</text>"));
});

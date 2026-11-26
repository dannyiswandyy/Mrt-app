import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadScript(relPath, extraGlobals = {}) {
  const src = readFileSync(new URL(relPath, import.meta.url), "utf8");
  const ctx = {
    window: {},
    console,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    ...extraGlobals
  };
  ctx.globalThis = ctx.window;
  vm.runInNewContext(src, ctx, { filename: relPath });
  return ctx.window;
}

const sampleLines = {
  NSL: {
    stations: [
      ["NS1", "Jurong East"],
      ["NS2", "Bukit Batok"],
      ["NS16", "Ang Mo Kio"],
      ["NS17", "Bishan"],
      ["NS28", "Marina South Pier"]
    ]
  },
  DTL: {
    stations: [
      ["DT1", "Bukit Panjang"],
      ["DT14", "Bugis"],
      ["DT35", "Expo"]
    ]
  }
};

const sampleTT = {
  services: [
    ["SERVICE_WD", "1111100", "20260101", "20261201"],
    ["SERVICE_WD_NEW", "1111100", "20261202", "20261231"]
  ],
  except: {},
  lines: {
    NSL: {
      pats: [
        [0, 1, [0, 120, 420, 600, 1200], [0, 140, 440, 620, 1200], 4], // full NS1->NS28
        [2, 1, [0, 180, 780], [0, 200, 780], 4],                      // pull-out AMK->MSP
        [0, 1, [0, 120, 420], [0, 140, 420], 2]                       // pull-in JE->AMK
      ],
      trips: [
        [21600, 1, 0, "NSL_SB_WD_001_01"], // 06:00 AMK->MSP (pull-out)
        [25200, 0, 0, "NSL_SB_WD_001_02"], // 07:00 full
        [25500, 0, 0, "NSL_SB_WD_002_01"], // 07:05 full
        [84600, 0, 0, "NSL_SB_WD_010_09"], // 23:30 last full train
        [85200, 2, 0, "NSL_SB_WD_010_10"]  // 23:40 JE->AMK (pull-in)
      ]
    },
    DTL: {
      pats: [
        [0, 1, [0, 900, 1800], [0, 920, 1800], 2]
      ],
      trips: [
        [25200, 0, 0, "DTL_EB_WD_001_01"],
        [84900, 0, 0, "DTL_EB_WD_009_09"], // 23:35 last DTL train
        [25200, 0, 1, "DTL_EB_WD_001_01"],
        [25800, 0, 1, "DTL_EB_WD_002_01"],
        [26400, 0, 1, "DTL_EB_WD_003_01"]
      ]
    }
  }
};

test("mrt-insights classifies depot pull-outs, pull-ins, headways, and schedule switches", () => {
  const { mrtInsights } = loadScript("../web/mrt-insights.js");

  const depot = mrtInsights.analyzeDepotAndSpecialRuns(sampleTT, sampleLines, "NSL", "2026-11-25");
  assert.equal(depot.totalTrips, 5);
  assert.equal(depot.pullOuts.length, 1);
  assert.equal(depot.pullOuts[0].fromCode, "NS16");
  assert.equal(depot.pullIns.length, 1);
  assert.equal(depot.pullIns[0].toCode, "NS16");

  const hw = mrtInsights.analyzeLineHeadways(sampleTT, sampleLines, "NSL", "2026-11-25");
  assert.equal(hw.totalTrips, 5);
  assert.equal(hw.totalRuns, 3);
  assert.ok(hw.peakActive >= 2);
  assert.equal(hw.periods.amPeak, 30);

  const changes = mrtInsights.detectScheduleChanges(sampleTT, "DTL", "2026-11-25");
  assert.equal(changes.length, 1);
  assert.equal(changes[0].effectiveDate, "2026-12-02");
  assert.equal(changes[0].oldTrips, 2);
  assert.equal(changes[0].newTrips, 3);
  assert.equal(changes[0].runDelta, 1);
});

test("mrt-insights last-train rescue flags safe, tight, and missed connections with RT delay", () => {
  const { mrtInsights } = loadScript("../web/mrt-insights.js");
  const route = {
    from: "Jurong East",
    to: "Expo",
    legs: [
      { line: "NSL", from: "Jurong East", fromCode: "NS1", to: "Marina South Pier", toCode: "NS28", board: 23 * 60 + 20, arrive: 23 * 60 + 32, wait: 3 },
      { line: "DTL", from: "Bukit Panjang", fromCode: "DT1", to: "Expo", toCode: "DT35", board: 23 * 60 + 33, arrive: 24 * 60 + 3, wait: 1 }
    ]
  };

  const tight = mrtInsights.evaluateLastTrainRescue(route, {
    tt: sampleTT,
    lines: sampleLines,
    iso: "2026-11-25",
    nowMins: 23 * 60 + 17
  });
  assert.equal(tight.overall, "tight");
  assert.equal(tight.minMargin, 2);

  const missed = mrtInsights.evaluateLastTrainRescue(route, {
    tt: sampleTT,
    lines: sampleLines,
    iso: "2026-11-25",
    nowMins: 23 * 60 + 17,
    rtDelayByLine: { DTL: 4 }
  });
  assert.equal(missed.overall, "missed");
});

test("mrt-insights collects and prioritizes GTFS-RT affected trains", () => {
  const { mrtInsights } = loadScript("../web/mrt-insights.js");
  const nowMs = Date.now();
  const list = mrtInsights.collectAffectedTrains({
    nowMs,
    lines: sampleLines,
    rtState: {
      at: nowMs - 10000,
      trips: {
        NSL_SB_WD_001_02: { d: 240, x: 0, route: "NSL", vehicle: { id: "601/602", label: "601/602", plate: "T001" } },
        DTL_EB_WD_002_01: { d: 0, x: 1, route: "DTL" }
      }
    }
  });
  assert.equal(list.length, 2);
  assert.equal(list[0].kind, "cancelled");
  assert.equal(list[1].kind, "delay");
  assert.equal(list[1].delayMin, 4);
  assert.equal(list[1].vehicle.plate, "T001");
});

test("fleet-dex builds spotting completion stats and projects tracked duties + approach alerts", () => {
  const { mrtFleetDex } = loadScript("../web/fleet-dex.js");
  const baseAt = Date.parse("2026-11-25T00:00:00Z"); // 08:00 SGT
  const spots = [
    { line: "NSL", set: "801/802", model: "R151", slot: "1", st: "Ang Mo Kio", kind: "ride", at: baseAt },
    { line: "NSL", set: "601/602", model: "C151B", slot: "2", st: "Bishan", kind: "spot", at: baseAt }
  ];

  const prog = mrtFleetDex.buildFleetProgress(spots, "NSEWL");
  assert.equal(prog.spottedSets, 2);
  assert.equal(prog.rodeSets, 1);

  const duties = mrtFleetDex.projectTrackedDuties({
    spots,
    iso: "2026-11-25",
    nowMins: 7 * 60 + 2,
    lines: sampleLines,
    getTrains: () => [{
      id: "NSLt25200p0",
      dir: 0,
      idx: 1,
      next: 2,
      to: 4,
      atStation: false,
      ref: {
        tid: "NSL_SB_WD_001_02",
        s: 25200,
        p: { f: 0, d: 1, arr: [0, 120, 300, 480, 900] }
      }
    }],
    getTrips: () => []
  });

  assert.equal(duties[0].set, "801/802");
  assert.equal(duties[0].status, "live");

  const alerts = mrtFleetDex.findApproachingWatchedSets(duties, ["801/802"], "Ang Mo Kio", 5);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].stationCode, "NS16");
  assert.equal(alerts[0].etaMin, 3);
});

test("trip-reminders inspects GTFS-RT delays and cancellations on planned routes", () => {
  const { mrtTripReminders } = loadScript("../web/trip-reminders.js");
  const nowMs = Date.now();
  const route = {
    a: "NS1",
    b: "DT35",
    from: "Jurong East",
    to: "Expo",
    legs: [
      { line: "NSL", from: "Jurong East", fromCode: "NS1", to: "Bishan", toCode: "NS17", tid: "NSL_SB_WD_001_02", board: 500, arrive: 520, wait: 2 },
      { line: "DTL", from: "Bugis", fromCode: "DT14", to: "Expo", toCode: "DT35", tid: "DTL_EB_WD_002_01", board: 525, arrive: 550, wait: 3 }
    ]
  };
  const alerts = mrtTripReminders.inspectRouteGtfsRt(route, {
    nowMs,
    rtState: {
      at: nowMs - 5000,
      trips: {
        NSL_SB_WD_001_02: { d: 300, x: 0, route: "NSL" },
        DTL_EB_WD_002_01: { d: 0, x: 1, route: "DTL" }
      }
    }
  });
  assert.equal(alerts.length, 2);
  assert.equal(alerts[0].delayMin, 5);
  assert.equal(alerts[1].cancelled, true);
});

test("alerts tab distinguishes service outages from planned closures and maintenance", () => {
  const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  const start = html.indexOf("const PLANNED_CLOSURE_RE =");
  const end = html.indexOf("window.mrtClassifyAlerts = classifyAlertState;", start);
  assert.ok(start > 0 && end > start, "alert classification helpers exist in web/index.html");
  const code = html.slice(start, end) + "\n({segKind, classifyAlertState});";
  const ctx = {
    window: {},
    LINES: {
      NSL: { name: "North-South Line" },
      EWL: { name: "East-West Line" },
      CCL: { name: "Circle Line" }
    },
    LINE_NAME_LTA: { NSL: "North-South Line", EWL: "East-West Line", CCL: "Circle Line" },
    NAME_OF: { NS1: "Jurong East", NS4: "Choa Chu Kang", EW24: "Jurong East", EW26: "Lakeside" },
    segTitle: sg => (sg.codes || []).join("–")
  };
  const { classifyAlertState } = vm.runInNewContext(code, ctx);

  const mixed = classifyAlertState({
    status: 2,
    segments: [
      { lines: ["NSL"], line: "NSL", ltaLine: "NSL", codes: ["NS1", "NS4"] },
      { lines: ["EWL"], line: "EWL", ltaLine: "EWL", codes: ["EW24", "EW26"] }
    ],
    messages: [
      { text: "NSL: No train service between Jurong East and Choa Chu Kang due to a track fault." },
      { text: "EWL: Planned closure between Jurong East and Lakeside for scheduled track renewal maintenance works." }
    ]
  });
  assert.equal(mixed.outages.length, 1);
  assert.equal(mixed.outages[0].line, "NSL");
  assert.equal(mixed.planned.length, 1);
  assert.equal(mixed.planned[0].line, "EWL");

  const msgOnly = classifyAlertState({
    status: 1,
    segments: [],
    messages: [
      { text: "Circle Line: Early closure tonight from 11pm for scheduled signalling renewal works." }
    ]
  });
  assert.equal(msgOnly.outages.length, 0);
  assert.equal(msgOnly.planned.length, 1);
  assert.equal(msgOnly.planned[0].line, "CCL");
});


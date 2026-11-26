import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../web/trip-reminders.js", import.meta.url), "utf8");

function loadTripReminders() {
  const sandbox = {
    window: {},
    console,
    Date,
    Math,
    Set,
    Array,
    Object,
    Number,
    String
  };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(src, sandbox, { filename: "trip-reminders.js" });
  return sandbox.window.mrtTripReminders;
}

const SAMPLE_LINES = {
  NSL: { name: "North-South Line" },
  EWL: { name: "East-West Line" }
};

const SAMPLE_NAMES = {
  NS17: "Bishan",
  NS18: "Braddell",
  NS19: "Toa Payoh",
  NS20: "Novena",
  NS25: "City Hall",
  EW13: "City Hall",
  EW12: "Bugis",
  EW11: "Lavender"
};

const SAMPLE_ROUTE = {
  from: "Bishan",
  to: "Lavender",
  a: "Bishan",
  b: "Lavender",
  mins: 22,
  arrive: 622,
  legs: [
    {
      line: "NSL",
      from: "Bishan",
      fromCode: "NS17",
      to: "City Hall",
      toCode: "NS25",
      toward: "Marina South Pier",
      stops: 4,
      ride: 10,
      wait: 3,
      board: 603,
      arrive: 613,
      ids: ["NS17", "NS18", "NS19", "NS20", "NS25"]
    },
    {
      line: "EWL",
      from: "City Hall",
      fromCode: "EW13",
      to: "Lavender",
      toCode: "EW11",
      toward: "Pasir Ris",
      stops: 2,
      ride: 5,
      wait: 4,
      board: 617,
      arrive: 622,
      ids: ["EW13", "EW12", "EW11"]
    }
  ]
};

test("every-station mode schedules boarding, intermediate stations, transfer, and destination alerts in order", () => {
  const api = loadTripReminders();
  const baseMs = Date.UTC(2026, 10, 23, 2, 0, 0); // 10:00 SGT (nowMins = 600)
  const list = api.buildReminderSchedule(SAMPLE_ROUTE, {
    nowMins: 600,
    nowMs: baseMs,
    mode: "every",
    leadMin: 1,
    lines: SAMPLE_LINES,
    nameOf: SAMPLE_NAMES
  });

  // Leg 0: board (NS17) + NS18 + NS19 + NS20 + transfer (NS25) = 5
  // Leg 1: board (EW13) + EW12 + destination (EW11) = 3
  assert.equal(list.length, 8);
  assert.deepEqual(
    Array.from(list, x => [x.kind, x.stationCode]),
    [
      ["board", "NS17"],
      ["station", "NS18"],
      ["station", "NS19"],
      ["station", "NS20"],
      ["transfer", "NS25"],
      ["board", "EW13"],
      ["station", "EW12"],
      ["destination", "EW11"]
    ]
  );

  // Chronological and every alert fires strictly before its station arrival
  for (let i = 0; i < list.length; i++) {
    assert.ok(list[i].at < list[i].arrivalAt, `alert ${list[i].id} fires before arrival`);
    if (i > 0) assert.ok(list[i].at >= list[i - 1].at, "schedule is chronologically ordered");
  }

  const transfer = list.find(x => x.kind === "transfer");
  assert.match(transfer.title, /City Hall/);
  assert.match(transfer.body, /East-West Line/);

  const dest = list.find(x => x.kind === "destination");
  assert.match(dest.title, /Lavender/);
  assert.equal(dest.stopsRemaining, 0);
});

test("key-stops mode skips intermediate stations and keeps boarding, transfers, and destination", () => {
  const api = loadTripReminders();
  const baseMs = Date.UTC(2026, 10, 23, 2, 0, 0);
  const list = api.buildReminderSchedule(SAMPLE_ROUTE, {
    nowMins: 600,
    nowMs: baseMs,
    mode: "key",
    leadMin: 2,
    lines: SAMPLE_LINES,
    nameOf: SAMPLE_NAMES
  });

  assert.deepEqual(
    Array.from(list, x => [x.kind, x.stationCode]),
    [
      ["board", "NS17"],
      ["transfer", "NS25"],
      ["board", "EW13"],
      ["destination", "EW11"]
    ]
  );
});

test("findNextUpcoming skips fired reminders and returns the next unreached station", () => {
  const api = loadTripReminders();
  const baseMs = Date.UTC(2026, 10, 23, 2, 0, 0);
  const list = api.buildReminderSchedule(SAMPLE_ROUTE, {
    nowMins: 600,
    nowMs: baseMs,
    mode: "every",
    leadMin: 1,
    lines: SAMPLE_LINES,
    nameOf: SAMPLE_NAMES
  });

  const fired = new Set([list[0].id, list[1].id]);
  const next = api.findNextUpcoming(list, baseMs + 4 * 60000, fired);
  assert.ok(next);
  assert.equal(next.stationCode, "NS19");
  assert.equal(next.stationName, "Toa Payoh");
});

test("trip-reminders.js is wired into web/index.html, service worker, and Android build workflow", () => {
  const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../web/sw.js", import.meta.url), "utf8");
  const wf = readFileSync(new URL("../.github/workflows/build-android.yml", import.meta.url), "utf8");

  assert.match(html, /<script src="trip-reminders\.js"><\/script>/);
  assert.match(sw, /addEventListener\("push"/);
  assert.match(sw, /addEventListener\("notificationclick"/);
  assert.match(wf, /cp web\/trip-reminders\.js mrt-tracker-app\/app\/src\/main\/assets\/trip-reminders\.js/);
});

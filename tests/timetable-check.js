"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadPage } = require("./load-page");

const root = path.join(__dirname, "..");
const failures = [];

function fail(msg) { failures.push(msg); }

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/* Current roster counts, copied from the operators' duty lists the page is built from.
   A change to those lists should fail here on purpose. */
const ROSTERS = {
  NSL: {
    wd: [[0, 31], [420, 69], [570, 31], [840, 29], [1020, 67], [1200, 37]],
    sat: [[0, 35], [420, 37], [570, 35], [840, 28], [1020, 39], [1200, 36]],
    sun: [[0, 35], [420, 39], [570, 35], [840, 28], [1020, 38], [1200, 35]],
    ph: [[0, 35], [420, 39], [570, 35], [840, 28], [1020, 38], [1200, 35]],
    ext: [[0, 35], [420, 37], [570, 35], [840, 28], [1020, 39], [1200, 37], [1380, 36]],
  },
  EWL: {
    wd: [[0, 32], [420, 73], [570, 32], [840, 31], [1020, 68], [1200, 42]],
    sat: [[0, 31], [420, 32], [570, 32], [1020, 43], [1200, 42]],
    sun: [[0, 40], [420, 44], [570, 41], [840, 32], [1020, 46], [1200, 41]],
    ph: [[0, 40], [420, 44], [570, 41], [840, 32], [1020, 46], [1200, 41]],
    ext: [[0, 40], [420, 44], [570, 41], [840, 32], [1020, 46], [1200, 45], [1380, 41]],
  },
  NEL: {
    wd: [[0, 14], [420, 40], [570, 14], [1020, 36], [1200, 15]],
    sat: [[0, 15], [1020, 19]],
    sun: [[0, 15], [1020, 19]],
    ph: [[0, 15], [1020, 19]],
    ext: [[0, 15], [1020, 19]],
  },
  TEL: {
    wd: [[0, 22], [420, 46], [570, 22], [1020, 45], [1200, 23]],
    sat: [[0, 23], [1020, 46], [1200, 40]],
    sun: [[0, 23], [1020, 29], [1200, 23]],
    ph: [[0, 23], [1020, 46], [1200, 23]],
    ext: [[0, 22], [1020, 44], [1200, 39]],
  },
  CCL: {
    wd: [[0, 33], [420, 73], [570, 33], [1020, 73], [1200, 44]],
    sat: [[0, 35], [420, 40], [570, 35]],
    sun: [[0, 28], [1020, 33], [1200, 11]],
    ph: [[0, 18], [1020, 19]],
    ext: [[0, 35], [420, 40], [570, 35]],
  },
};
const CG_TRAINS = [[0, 2], [1020, 3], [1200, 2]];

const LINES = ["NSL", "EWL", "CG", "NEL", "CCL", "DTL", "TEL"];
const DAYS = [
  ["weekday", "2026-11-12", 4],
  ["Saturday", "2026-10-31", 6],
  ["Sunday", "2026-11-01", 0],
  ["public holiday", "2026-11-09", 1],
  ["holiday eve", "2026-11-07", 6],
];
const BANDS = [
  ["before the morning", 6 * 60],
  ["morning peak", 8 * 60],
  ["midday", 12 * 60],
  ["afternoon", 15 * 60],
  ["evening peak", 18 * 60],
  ["after 8pm", 21 * 60],
  ["after 11pm", 23 * 60 + 30],
];

function stamp(api, iso, dow, mins) {
  return {
    mins, iso, dow,
    weekend: dow === 0 || dow === 6 || !!api.PH_DAYS[iso],
    clock: "12:00:00",
  };
}

function snapshot(api, code, iso, dow, mins) {
  const now = stamp(api, iso, dow, mins);
  const day = api.dayOf(now);
  const weekend = api.dayBase(day) !== "wd";
  const L = api.LINES[code];
  const hw = api.headway(L, mins, weekend, code, 0, day);
  const running = api.trainsOn(code, now, true).length;
  return { day, hw, running };
}

function dtlGap(day, mins) {
  const base = day.startsWith("ext:") ? day.split(":")[2] : day;
  if (mins >= 23 * 60) return 7;
  const peak = base === "wd" && ((mins >= 7 * 60 && mins < 9 * 60 + 30) || (mins >= 17 * 60 && mins < 20 * 60));
  return peak ? 2.5 : 4.5;
}

function pageHtml() {
  return fs.readFileSync(path.join(root, "web/index.html"), "utf8");
}

function embeddedHtml() {
  const yml = fs.readFileSync(path.join(root, ".github/workflows/build-android.yml"), "utf8");
  const mark = "base64 -d <<'MRTAPP_EOF' | xz -d > 'mrt-tracker-app/app/src/main/assets/index.html'";
  const at = yml.indexOf(mark);
  if (at < 0) throw new Error("build-android.yml has no embedded index.html");
  const rest = yml.slice(at + mark.length);
  const end = rest.search(/\n[ \t]*MRTAPP_EOF\b/);
  if (end < 0) throw new Error("embedded index.html is missing its MRTAPP_EOF end");
  const b64 = rest.slice(0, end).replace(/\s+/g, "");
  const packed = Buffer.from(b64, "base64");
  const xz = spawnSync("xz", ["-dc"], { input: packed, maxBuffer: 32 * 1024 * 1024 });
  if (xz.status !== 0) {
    throw new Error("could not unpack the embedded page: " + (xz.stderr || xz.error || "").toString());
  }
  return xz.stdout.toString("utf8");
}

function checkFingerprints(html, where) {
  const banned = ["sha" + "256-", "integr" + "ity="];
  for (const s of banned) {
    if (html.includes(s)) fail(where + " contains " + s);
  }
}

function checkRosters(api, label) {
  for (const [code, days] of Object.entries(ROSTERS)) {
    const got = api[code + "_TRAINS"];
    if (!same(got, days)) fail(label + " " + code + " train counts changed: " + JSON.stringify(got));
  }
  if (!same(api.CG_TRAINS, CG_TRAINS)) fail(label + " Changi Airport branch train counts changed");
  const dtl = api.LINES.DTL;
  if (dtl.trains) fail(label + " Downtown Line has a roster; it should still use its usual gaps");
  if (dtl.peak !== 2.5 || dtl.off !== 4.5 || dtl.late !== 7) {
    fail(label + " Downtown Line gaps are " + [dtl.peak, dtl.off, dtl.late].join("/") + ", expected 2.5/4.5/7");
  }
}

function checkCases(api, label) {
  if (api.dayOf(stamp(api, "2026-11-12", 4, 8 * 60)) !== "wd") fail(label + " 12 Nov 2026 is not a weekday");
  if (api.dayOf(stamp(api, "2026-10-31", 6, 8 * 60)) !== "sat") fail(label + " 31 Oct 2026 is not a Saturday");
  if (api.dayOf(stamp(api, "2026-11-01", 0, 8 * 60)) !== "sun") fail(label + " 1 Nov 2026 is not a Sunday");
  if (api.dayOf(stamp(api, "2026-11-09", 1, 8 * 60)) !== "ph") fail(label + " 9 Nov 2026 is not a public holiday");
  if (api.dayOf(stamp(api, "2026-11-07", 6, 8 * 60)) !== "ext:2026-11-07:sat") fail(label + " 7 Nov 2026 is not the holiday eve");

  for (const [dayName, iso, dow] of DAYS) {
    for (const [band, mins] of BANDS) {
      for (const code of LINES) {
        const got = snapshot(api, code, iso, dow, mins);
        if (!(got.hw > 0) || !Number.isFinite(got.hw)) fail(`${label} ${code} ${dayName} ${band}: headway ${got.hw}`);
        if (got.running < 0) fail(`${label} ${code} ${dayName} ${band}: negative trains`);
        if (code === "DTL") {
          const want = dtlGap(got.day, mins);
          if (got.hw !== want) fail(`${label} DTL ${dayName} ${band}: headway ${got.hw}, expected ${want}`);
          if (mins < 23 * 60 && got.running < 1) fail(`${label} DTL ${dayName} ${band}: no trains in service`);
        }
        if (code === "CG") {
          const want = mins >= 17 * 60 && mins < 20 * 60 ? 3 : 2;
          if (got.running !== want) fail(`${label} Changi Airport branch ${dayName} ${band}: ${got.running} trains, expected ${want}`);
        }
      }
    }
  }

  const wdAm = snapshot(api, "NSL", "2026-11-12", 4, 8 * 60);
  const wdMid = snapshot(api, "NSL", "2026-11-12", 4, 12 * 60);
  if (!(wdAm.running > wdMid.running)) fail(label + " North-South weekday morning peak does not run more trains than midday");
  const dtlAm = snapshot(api, "DTL", "2026-11-12", 4, 8 * 60);
  const dtlMid = snapshot(api, "DTL", "2026-11-12", 4, 12 * 60);
  if (!(dtlAm.running > dtlMid.running)) fail(label + " Downtown Line weekday peak does not run more trains than midday");
  if (!(dtlAm.hw < dtlMid.hw)) fail(label + " Downtown Line peak gap is not shorter than the midday gap");
}

function checkMatch(web, app) {
  for (const [dayName, iso, dow] of DAYS) {
    for (const [band, mins] of BANDS) {
      for (const code of LINES) {
        const a = snapshot(web, code, iso, dow, mins);
        const b = snapshot(app, code, iso, dow, mins);
        if (a.day !== b.day || a.hw !== b.hw || a.running !== b.running) {
          fail(`packed page differs on ${code} ${dayName} ${band}: web ${a.running} trains every ${a.hw} min (${a.day}), packed ${b.running} every ${b.hw} (${b.day})`);
        }
      }
    }
  }
}

function main() {
  const html = pageHtml();
  checkFingerprints(html, "web/index.html");
  const web = loadPage(html);
  checkRosters(web, "website");
  checkCases(web, "website");

  const packed = embeddedHtml();
  if (!packed.includes("function headway") || !packed.includes("NSL_TRAINS")) fail("packed page has no timetable script");
  const app = loadPage(packed);
  checkRosters(app, "packed page");
  checkCases(app, "packed page");
  checkMatch(web, app);

  if (failures.length) {
    for (const f of failures) console.error("FAIL " + f);
    console.error(failures.length + " timetable check" + (failures.length === 1 ? "" : "s") + " failed");
    process.exit(1);
  }
  const cases = DAYS.length * BANDS.length * LINES.length;
  console.log("Timetable checks passed: " + cases + " line/day/time cases on the website and the packed page (DTL 2.5/4.5/7).");
}

main();

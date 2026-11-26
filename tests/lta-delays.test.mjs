// LTA's delays: "additional travel time" in LTA's alerts slows the trains on that stretch, and a delay LTA's live feed
// gave stays (getting smaller) after the feed stops listing the train. Same test in MRT Dev and the public repo.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const pagePath = ["../android/app/src/main/assets/index.html", "../web/index.html"].map(x => new URL(x, import.meta.url)).find(u => fs.existsSync(u));
const html = fs.readFileSync(pagePath, "utf8");
const part = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i >= 0 && j > i, "the page has " + a.slice(0, 50)); return html.slice(i, j); };
const slowCode = part("/* ---------- LTA's \"additional travel time\" ----------", "function ttSched(code, r, sec, mv){");
const linesCode = part("function linesMentionedInText(text){", "function classifyAlertState(state){");
const carryCode = part("/* ---------- LTA's delays after its feed goes quiet ----------", "window.rtShifts = (code, iso) => {");

const names = (code, list) => list.split(",").map((n, i) => [code + (i + 1), n]);
const LINES = {
  NSL: {stations: names("NS", "Jurong East,Bukit Batok,Bukit Gombak,Choa Chu Kang,Yew Tee,Kranji,Marsiling,Woodlands,Admiralty,Sembawang,Canberra,Yishun,Khatib,Yio Chu Kang,Ang Mo Kio,Bishan")},
  EWL: {stations: names("EW", "Pasir Ris,Tampines,Simei,Tanah Merah,Bedok,Kembangan")},
  CG: {stations: [["EW4", "Tanah Merah"], ["CG1", "Expo"], ["CG2", "Changi Airport"]]},
  SE: {stations: names("SE", "Sengkang,Compassvale,Rumbia"), loop: true}
};
function page(alerts){
  const ctx = {LINES, alertState: alerts, sgNow: () => ({iso: "2026-11-26", mins: 18 * 60 + 20}), Date};
  vm.runInNewContext(linesCode + slowCode + "; this.slowFromMessages = slowFromMessages; this.alertSlowFor = alertSlowFor; this.slowNow = slowNow;", ctx);
  return ctx;
}
const plain = x => JSON.parse(JSON.stringify(x));
const at = "2026-11-26 18:00:00", since = Date.parse("2026-11-26T18:00:00+08:00");

test("LTA's words become a stretch, a direction and a number of minutes", () => {
  const p = page(null);
  const out = plain(p.slowFromMessages([
    {text: "1800hrs: NSL - Additional travelling time of 15 mins between Yishun and Woodlands stations towards Jurong East due to a track fault.", at},
    {text: "EWL: Please add 10 minutes of travel time between Tanah Merah and Changi Airport.", at},
    {text: "NSL: Expect an additional 20-25 mins of journey time between Kranji and Bishan in both directions.", at}]));
  assert.deepEqual(out.map(x => [x.line, LINES[x.line].stations[x.lo][1], LINES[x.line].stations[x.hi][1], x.dirs, x.add / 60, x.since]), [
    ["NSL", "Woodlands", "Yishun", [1], 15, since],
    ["CG", "Tanah Merah", "Changi Airport", [0, 1], 10, since],
    ["NSL", "Kranji", "Bishan", [0, 1], 25, since]]);
});

test("advisories about planned works, words without minutes and the LRT loops don't count", () => {
  const p = page(null);
  assert.deepEqual(plain(p.slowFromMessages([
    {text: "NSL: On Sundays from 6 Dec, please add 15 mins of travel time between Jurong East and Woodlands.", at},
    {text: "NSL: Please cater additional travelling time between Yishun and Woodlands.", at},
    {text: "SLRT: Additional travelling time of 10 mins between Sengkang and Rumbia.", at},
    {text: "NSL: Train services between Yishun and Woodlands have resumed.", at}])), []);
});

test("a run that goes through after LTA said so is up to the full amount late; one before it, not at all", () => {
  const msg = "NSL - Additional travelling time of 15 mins between Yishun and Woodlands stations towards Jurong East.";
  const p = page({status: 1, segments: [], at: Date.now(), messages: [{text: msg, at}]});
  const arr = Array.from({length: 16}, (_, k) => k * 120), dep = arr.map(x => x + 30);
  const pat = {f: 15, d: -1, arr, dep, end: arr[15]};                // Bishan to Jurong East: Yishun is stop 4, Woodlands 8
  const late = p.alertSlowFor("NSL", {s: 18 * 3600 + 5 * 60, p: pat});
  assert.ok(late, "slowed");
  assert.equal(late.late(4), 0, "on time getting to Yishun");
  assert.equal(late.late(6), 450, "half way (Sembawang): half of it");
  assert.equal(late.late(8), 900, "at Woodlands: all 15 minutes");
  assert.equal(late.late(15), 900, "and carries it on");
  assert.equal(p.alertSlowFor("NSL", {s: 17 * 3600, p: pat}), null, "a run that went through before 6pm");
  const other = {f: 0, d: 1, arr, dep, end: arr[15]};               // the other way: not in that direction
  assert.equal(p.alertSlowFor("NSL", {s: 18 * 3600 + 5 * 60, p: other}), null);
});

test("an alert over 30 minutes old (the app couldn't check) isn't used", () => {
  const p = page({status: 1, segments: [], at: Date.now() - 31 * 60e3, messages: [{text: "NSL - Additional travelling time of 15 mins between Yishun and Woodlands.", at}]});
  assert.deepEqual(plain(p.slowNow()), []);
});

test("a delay LTA stopped listing shrinks by 6 s a minute, and is gone under 20 s or after 90 minutes", () => {
  const saved = {};
  const ctx = {store: {get: k => saved[k] ?? null, set: (k, v) => { saved[k] = v; }}, sgNow: () => ({iso: "2026-11-26"}), Date};
  vm.runInNewContext(carryCode + "; this.rtCarry = rtCarry; this.rtCarried = rtCarried; this.rtCarryUpdate = rtCarryUpdate;", ctx);
  ctx.rtCarryUpdate({trips: {A: {d: 240}, B: {x: 1}, C: {d: 300, add: 1}}});
  const t0 = ctx.rtCarry.A.at;
  assert.equal(ctx.rtCarried("A", "2026-11-26", t0 + 3 * 60e3).d, 222);
  assert.equal(ctx.rtCarried("A", "2026-11-26", t0 + 38 * 60e3), null, "under 20 s: back on the timetable");
  assert.equal(ctx.rtCarried("A", "2026-11-27", t0 + 60e3), null, "another day's trip");
  assert.equal(ctx.rtCarried("B", "2026-11-26", t0 + 60 * 60e3).x, 1, "a cancelled train stays cancelled");
  assert.equal(ctx.rtCarried("B", "2026-11-26", t0 + 91 * 60e3), null, "for 90 minutes at most");
  assert.equal(ctx.rtCarried("C", "2026-11-26", t0 + 60e3), null, "extra trains LTA added aren't kept");
  ctx.rtCarryUpdate({held: true, trips: {A: {d: 600}}});
  assert.equal(ctx.rtCarry.A.d, 240, "the 2-minute hold of LTA's last answer doesn't count as a new one");
  assert.ok(saved["mrt.rtCarry"], "kept on the phone, so a reload keeps it");
});

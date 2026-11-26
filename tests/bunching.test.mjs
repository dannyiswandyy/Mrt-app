// Bunching: when a train runs late, the trains behind it can't catch it up. They wait (outside the station it's at,
// or at the one before) and carry the delay on, each one a little less. On-time trains are never held.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// the same test in MRT Dev and the public repo: whichever page this repo has
const pagePath = ["../android/app/src/main/assets/index.html", "../web/index.html"].map(x => new URL(x, import.meta.url)).find(u => fs.existsSync(u));
const html = fs.readFileSync(pagePath, "utf8");
const a = html.indexOf("/* ---------- Bunching: a late train holds up the trains behind it"), b = html.indexOf("function trainsOn(", a);
assert.ok(a >= 0 && b > a, "the page's bunching code is there");
const code = html.slice(a, b);

// a 10-station line; every run calls at all of them, a minute apart, and waits 20 s at each
const N = 10, P = (() => { const arr = [], dep = []; for (let k = 0; k < N; k++){ arr.push(k * 60); dep.push(k * 60 + 20); } return {f: 0, d: 1, arr, dep, end: (N - 1) * 60}; })();
function ttState(r, sec){
  const e = sec - r.s; if (e < 0 || e > r.p.end) return null;
  const k = Math.min(N - 1, Math.floor(e / 60)), w = e - k * 60, at = w <= 20 || k === N - 1;
  return {idx: at ? k : k + (w - 20) / 40, at, k, doors: at && w > 15};
}
function page(nowMins){
  const ctx = {LINES: {DTL: {stations: Array.from({length: N}, (_, i) => ["DT" + i, "S" + i])}}, ttState, sgNow: () => ({mins: nowMins})};
  vm.runInNewContext(code + "; this.bunchUp = bunchUp; this.BUNCH = BUNCH; this.bunchHeld = bunchHeld;", ctx);
  return ctx;
}
// a train as the page has it: on its run's own timetable time `sec` (late by `lag` seconds) at clock time `clk`
function train(id, start, clk, lag = 0){
  const r = {s: start, p: P, pi: 0}, st = ttState(r, clk - lag);
  return {id: "DTLt" + start + "p0", name: id, dir: 0, ref: r, idx: st.idx, atStation: st.at, next: st.at ? st.k : st.k + 1, eta: 0, lag, clk};
}
const plain = x => JSON.parse(JSON.stringify(x));

test("on-time trains three minutes apart: nobody is held", () => {
  const clk = 1000, p = page(clk / 60);
  const list = [train("A", 500, clk), train("B", 680, clk), train("C", 860, clk)];
  const out = p.bunchUp("DTL", {mins: clk / 60}, list);
  assert.equal(out, list, "the same list back");
  assert.ok(out.every(t => !t.held));
});

test("a train 4 minutes late holds the one behind, and that one the next, less each time", () => {
  const clk = 1000, p = page(clk / 60);
  // A should be at S10 by now but is 4 min late; B is 3 min behind it in the timetable, C 3 min behind B
  const out = plain(p.bunchUp("DTL", {mins: clk / 60}, [train("A", 400, clk, 240), train("B", 580, clk), train("C", 760, clk)]));
  const [A, B, C] = out;
  assert.ok(!A.held, "the late train itself isn't held");
  assert.equal(B.held, 240 - (180 - 90), "B keeps 90 s behind A: 150 s");
  assert.equal(C.held, 150 - (180 - 90), "C keeps 90 s behind B: 60 s");
  assert.equal(B.heldBehind, A.id);
  assert.ok(B.idx < A.idx && C.idx < B.idx, "nobody passes the train ahead");
  assert.ok(A.idx - B.idx >= 0.35 - 1e-9, "B waits outside the station A is at");
  assert.equal(p.bunchHeld("DTL", {s: 580, p: P, pi: 0}), 150, "next train times include it");
});

test("timetable order counts: an on-time train that would already be past the late one stays behind it", () => {
  const clk = 1000, p = page(clk / 60);
  // B on time would be at 7.0, past A (late 5 min, at 6.25): it's still behind A
  const A = train("A", 520, clk, 300), B = train("B", 580, clk);
  assert.ok(B.idx > A.idx, "without bunching it would be drawn ahead");
  const out = plain(p.bunchUp("DTL", {mins: clk / 60}, [B, A]));
  const b = out.find(t => t.name === "B"), a2 = out.find(t => t.name === "A");
  assert.ok(b.held > 0 && b.idx < a2.idx, "held behind A instead");
});

test("other lines, trains in a layover and LTA's added trains are left alone", () => {
  const clk = 1000, p = page(clk / 60);
  const list = [train("A", 400, clk, 240), Object.assign(train("B", 580, clk), {layover: true})];
  assert.equal(p.bunchUp("DTL", {mins: clk / 60}, list), list);
  const cc = [train("A", 400, clk, 240), train("B", 580, clk)];
  assert.equal(p.bunchUp("CCL", {mins: clk / 60}, cc), cc, "the Circle Line (a loop and branches) isn't done");
});

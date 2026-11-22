// Duty abbreviations are estimated from LTA scheduled trip times, not a spotter roster.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../web/run-graph.js", import.meta.url), "utf8");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(source, ctx);
const RG = ctx.mrtRunGraph;
const H = hour => hour * 3600;
const run = (...legs) => ({run: "406", line: "NSL", service: "SERVICE_WE",
  trips: legs.map(([first, last]) => ({dep: H(first), arr: H(last)}))});
const code = r => RG.classifyDuty(r).code;

test("FD and FD LN can combine, but only when midday trips are scheduled", () => {
  assert.equal(code(run([5.5, 8.2], [11.1, 13], [16.5, 20.5])), "FD");
  assert.equal(code(run([5.5, 8.2], [11.1, 13], [18, 24.3])), "FD LN");
  assert.notEqual(code(run([5.5, 8.2], [18, 24.3])), "FD LN",
    "a long gap with no midday passenger service is not proof of a full-day working");
});

test("AM, HD and OP are inferred from their scheduled windows", () => {
  assert.equal(code(run([5.8, 8.4], [8.8, 10.1])), "(AM)");
  assert.equal(code(run([6.2, 9], [11.1, 14.5])), "HD");
  assert.equal(code(run([11, 12.5], [13.1, 15])), "(OP)");
});

test("PM, PM LN and cross-midnight special trains are distinguished", () => {
  assert.equal(code(run([17, 18], [19.1, 20.2])), "(PM)");
  assert.equal(code(run([17, 18], [23, 24.5])), "(PM) LN");
  assert.equal(code(run([2.5, 2.9])), "LN", "Sunday 02:30 special service");
  assert.equal(code(run([26.5, 26.9])), "LN", "Saturday 26:30 GTFS notation");
});

test("empty and unsupported windows are unclassified, never fabricated", () => {
  assert.equal(code(run()), "Unclassified");
  assert.equal(code(run([11, 12])), "Unclassified");
  assert.equal(code(run([5.5, 8], [11, 13], [17, 23])), "FD",
    "finishing exactly at 23:00 is not an LN duty");
  const duty = RG.classifyDuty(run([5.5, 8], [11, 13], [17, 23.1]));
  assert.equal(duty.code, "FD LN");
  assert.ok(duty.evidence.some(x => x.includes("LTA scheduled passenger")));
  assert.ok(duty.evidence.some(x => x.includes("not an operator-issued roster")));
});

test("train journey labels have no hard-coded November 22 enthusiast roster", () => {
  const labelSource = fs.readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(labelSource, /const\s+rostersNov22\s*=/);
  assert.doesNotMatch(labelSource, /label:\s*["']SPOTTER ROSTER["']/);
});

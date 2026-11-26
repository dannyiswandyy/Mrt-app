// What's new: build_changelog.py makes every version's changes from the repo's history, and the page shows them.
// Same file in MRT Dev and the public repo (it finds each repo's own paths).
import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const pick = (...p) => p.map(x => join(ROOT, x)).find(existsSync);
const SCRIPT = pick("tools/build_changelog.py", "android/tools/build_changelog.py");
const PAGE = pick("web/index.html", "android/app/src/main/assets/index.html");
const BUILD = pick(".github/workflows/build-android-dev.yml", ".github/workflows/build-android.yml");   // MRT Dev's own build first

const env = {...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t"};
function repo(){
  const dir = mkdtempSync(join(tmpdir(), "changelog-"));
  const git = (...a) => execFileSync("git", a, {cwd: dir, env, encoding: "utf-8"});
  git("init", "-q", "-b", "main");
  let n = 0;
  const commit = (msg, file = "web/page.txt") => {
    mkdirSync(join(dir, file, ".."), {recursive: true});
    writeFileSync(join(dir, file), String(++n));
    git("add", "-A"); git("commit", "-q", "-m", msg);
    return git("rev-parse", "HEAD").trim();
  };
  const note = (sha, v) => git("notes", "--ref=versions", "append", "-m", v, sha);
  const run = (...a) => {
    execFileSync("python3", [SCRIPT, "--paths", "web", "--out", "cl.js", "--notes", "notes.md", ...a], {cwd: dir, env, stdio: "pipe"});
    const w = {}; new Function("window", readFileSync(join(dir, "cl.js"), "utf-8"))(w);
    return {list: w.MRT_CHANGELOG, appVersion: w.MRT_APP_VERSION, notes: readFileSync(join(dir, "notes.md"), "utf-8")};
  };
  return {dir, commit, note, run, done: () => rmSync(dir, {recursive: true, force: true})};
}

test("each version lists the changes since the version before it, newest first", () => {
  const r = repo();
  try {
    const a = r.commit("Map: trains drawn as pictures [Claude]");
    r.note(a, "2026.11.20-1000");
    r.commit("fix: Line Board shows the right icons (ChatGPT)");
    const b = r.commit("Clock shows the phone's second exactly; fix two checks that block deploys");
    r.note(b, "2026.11.21-0900");
    r.note(b, "2026.11.21-1500");                    // built again with nothing new
    r.commit("Taxis at stations");
    const {list, notes, appVersion} = r.run("--version", "2026.11.22-0800");
    assert.deepEqual(list.map(e => e.v), ["2026.11.22-0800", "2026.11.21-1500", "2026.11.21-0900", "2026.11.20-1000"]);
    assert.equal(appVersion, "2026.11.22-0800");
    assert.deepEqual(list[0].items, ["Taxis at stations"]);
    assert.deepEqual(list[1].items, ["Newest LTA train timetable"]);
    // names of the AI, "fix:" and the part about checks are left out
    assert.deepEqual(list[2].items, ["Clock shows the phone's second exactly", "Line Board shows the right icons"]);
    assert.deepEqual(list[3].items, ["Map: trains drawn as pictures"]);
    assert.equal(list[0].date, "2026-11-22");
    assert.match(notes, /^### What's new in 2026\.11\.22-0800 · 22 Nov 2026\n\n- Taxis at stations/);
    assert.match(notes, /### Every version/);
  } finally { r.done(); }
});

test("a commit can word itself for the changelog, or leave itself out", () => {
  const r = repo();
  try {
    r.commit("Sync GTFS dwell positions with core\n\nChangelog: Trains wait at each platform as long as the timetable says");
    r.commit("Tidy the station card code\n\nChangelog: skip");
    r.commit("Add tests for the clock", "tests/clock.test.mjs");      // not an app path
    const {list} = r.run("--version", "2026.11.22-0800");
    assert.deepEqual(list[0].items, ["Trains wait at each platform as long as the timetable says"]);
  } finally { r.done(); }
});

test("a version whose changes are all behind the scenes says so, and the website lists what's newer than the app", () => {
  const r = repo();
  try {
    const a = r.commit("Rebuild the app after the regression tests change");
    r.note(a, "2026.11.20-1000");
    r.commit("Map: neater labels");
    const {list, appVersion} = r.run();              // the website: no version of its own
    assert.equal(appVersion, "2026.11.20-1000");      // it shows the newest app version it's the same as
    assert.equal(list[0].v, null);
    assert.deepEqual(list[0].items, ["Map: neater labels"]);
    assert.deepEqual(list[1].items, ["Small fixes and improvements"]);
  } finally { r.done(); }
});

test("the public changelog leaves out MRT Dev and its features", () => {
  const r = repo();
  try {
    r.commit("Future rail: station boards for lines not open yet");
    r.commit("Dev tools: GTFS analysis shows feed changes");
    r.commit("Stations: taxi availability; hidden Skytrain module");
    const pub = r.run("--public", "--version", "2026.11.22-0800").list[0].items;
    assert.deepEqual(pub, ["Stations: taxi availability"]);
    const dev = r.run("--version", "2026.11.22-0800").list[0].items;
    assert.equal(dev.length, 3);
  } finally { r.done(); }
});

test("the page shows What's new, and the build makes it and saves each version", () => {
  const page = readFileSync(PAGE, "utf-8"), build = readFileSync(BUILD, "utf-8");
  assert.match(page, /function wnCard\(id\)/);
  assert.match(page, /s\.src = "changelog\.js"/);
  assert.match(page, /id="wnOpen"/);
  assert.match(build, /build_changelog\.py[\s\S]*--out mrt-tracker-app\/app\/src\/main\/assets\/changelog\.js/);
  assert.match(build, /--notes-file notes\.md/);
  assert.match(build, /build_changelog\.py --paths \S+ --version "\$VN" --record\n\s*git push -q origin refs\/notes\/versions/);
  assert.match(build, /fetch-depth: 0/);
  assert.match(build, /actions: read/);
});

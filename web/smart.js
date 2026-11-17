/* MRT Tracker – smart layer (the same file in the app and the website).
   Loaded after the page's own script, it hooks in from outside so the page's core timing code stays as it is:

   1. Smarter train times
      - LIVE PROPAGATION: when LTA's live feed (GTFS-Realtime) says the other trains on a line are running late,
        trains the feed has nothing on are shown that late too (STRONG INFERENCE).
      - LEARNING: while the live feed is up, this device remembers how late each line runs by direction, hour and
        weekday/weekend (dry weather only). When the feed is down, trains are shown as late as they usually are
        then, once there are enough readings (POSSIBLE).
      Both go in through window.rtShifts (the page's "moved trains" map), so the map, Line Board, next trains
      and the trip planner all follow. Wet rails keep their own slowdown: nothing is added on a wet line.
   2. Smarter Ask: "When should I leave Bishan to reach Raffles Place by 9am?", "Is the NSL running late?",
      "Are the rails wet?", "Is the EWL usually late at 6pm?", "Anything I should know?"
   3. Proactive alerts: a "Heads up" card on Home for your stations (disruptions, late trains, wet rails,
      long waits, last trains).
   4. Smarter trip planner: expected delays on your route, wet stretches, and an "Arrive by" box that finds the
      latest train to catch.
   Everything is wrapped in try/catch: if anything here fails, the app works exactly as it did without it. */
(() => {
"use strict";
const W = window;
/* The page starts its main script a moment after this file loads, so wait for it (up to a minute). */
const ready = () => { try { return typeof sgNow === "function" && typeof LINES === "object" && typeof ttTrips === "function" && typeof store === "object" && typeof ORDER !== "undefined" && typeof W.rtShifts === "function"; } catch(e){ return false; } };
let tries = 0;
(function wait(){ if (ready()) { try { init(); } catch(e){ try { console.warn("smart.js", e); } catch(_){} } } else if (++tries < 300) setTimeout(wait, 200); })();
function init(){
if (W.mrtSmart) return;

const S = {learn: null, saved: 0, lastSample: {}, liveCache: {at: -1, data: {}}, idx: {iso: "", map: null}};
const LKEY = "mrt.smart.learn", MIN_LEARN = 6, MAX_KEEP = 30;
const nowSec = () => sgNow().mins * 60;
const hourOf = m => Math.floor(((m % 1440) + 1440) % 1440 / 60);
const dayType = iso => { const d = new Date(iso + "T00:00:00Z").getUTCDay(); return d === 0 || d === 6 ? "we" : "wd"; };
const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
const lineName = c => c === "CG" ? "Changi Airport branch" : (LINES[c] && LINES[c].name) || c;
const short = c => c === "CG" ? "CGL" : c;
const fmtDelay = s => { const a = Math.abs(s); return a < 90 ? `${Math.round(a / 5) * 5} s` : `${Math.round(a / 60)} min`; };
const safeAlert = () => { try { return alertState; } catch(e){ return null; } };
const safeRt = () => { try { return rtState; } catch(e){ return null; } };
const liveFresh = () => { const r = safeRt(); return !!(r && r.trips && r.at && Date.now() - r.at < 5 * 60e3); };
const wetLines = () => { try { return new Set(typeof wetNow === "function" ? wetNow().map(w => w.code) : []); } catch(e){ return new Set(); } };
const esc2 = s => { try { return esc(s); } catch(e){ return String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c])); } };

/* ---------- learning store ---------- */
function learnStore(){
  if (!S.learn){ const v = store.get(LKEY, null); S.learn = v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  return S.learn;
}
const bucketKey = (code, dir, iso, mins) => `${code}|${dir}|${dayType(iso)}|${hourOf(mins)}`;
function learned(code, dir, iso, mins){
  const b = learnStore()[bucketKey(code, dir, iso, mins)];
  return Array.isArray(b) && b.length >= MIN_LEARN ? {sec: med(b), n: b.length} : null;
}

/* ---------- LTA's live feed, per line and direction, for trains running now ---------- */
function liveByLine(){
  const rt = safeRt(); if (!liveFresh()) return {};
  if (S.liveCache.at === rt.at) return S.liveCache.data;
  const now = sgNow(), sec = now.mins * 60, out = {};
  for (const code of ORDER){
    let list = null; try { list = ttTrips(code, now.iso); } catch(e){}
    if (!list) continue;
    const ds = [[], []];
    for (const r of list){
      if (!r.tid || !r.p || r.s > sec || r.s + r.p.end < sec) continue;     // only trains out on the line now
      const u = rt.trips[r.tid]; if (!u || u.x || typeof u.d !== "number") continue;
      ds[r.p.d > 0 ? 0 : 1].push(u.d);
    }
    out[code] = ds.map(a => a.length ? {sec: med(a), n: a.length, late: a.filter(x => x >= 120).length} : null);
  }
  S.liveCache = {at: rt.at, data: out};
  return out;
}
/* How late trains on a line are running this way: live first, then what this device has learned. */
function lineDelay(code, dir){
  const now = sgNow(), lv = liveByLine()[code];
  if (lv && lv[dir] && lv[dir].n >= 3) return {sec: lv[dir].sec, n: lv[dir].n, src: "live"};
  if (liveFresh()) return null;
  const l = learned(code, dir, now.iso, now.mins);
  return l ? {sec: l.sec, n: l.n, src: "learned"} : null;
}
function sample(){
  try {
    if (!liveFresh()) return;
    const now = sgNow(), lv = liveByLine(), wet = wetLines(), L = learnStore(), t = Date.now();
    let changed = false;
    for (const code in lv) for (const dir of [0, 1]){
      const x = lv[code][dir]; if (!x || x.n < 2 || wet.has(code)) continue;          // dry weather only: wet rails are handled on their own
      const k = bucketKey(code, dir, now.iso, now.mins);
      if (t - (S.lastSample[k] || 0) < 120e3) continue;                                // a reading every 2 minutes at most
      S.lastSample[k] = t;
      const b = Array.isArray(L[k]) ? L[k] : (L[k] = []);
      b.push(Math.round(Math.max(-120, Math.min(600, x.sec)) / 5) * 5);
      if (b.length > MAX_KEEP) b.splice(0, b.length - MAX_KEEP);
      changed = true;
    }
    if (changed && t - S.saved > 120e3){ store.set(LKEY, L); S.saved = t; }
  } catch(e){}
}
setInterval(sample, 30e3); setTimeout(sample, 8e3);
addEventListener("pagehide", () => { try { if (S.learn) store.set(LKEY, S.learn); } catch(e){} });

/* ---------- 1. smarter times: extra shifts for trains LTA's feed doesn't cover ---------- */
const inferred = {};          // code -> {key, base, map, info: Map(runId -> {sec, src, n})}
function inferFor(code, iso, base){
  const now = sgNow(); if (iso !== now.iso) return null;
  if (wetLines().has(code)) return null;                                               // wet rails take over
  const d = [lineDelay(code, 0), lineDelay(code, 1)].map(x => x && Math.abs(x.sec) >= (x.src === "live" ? 30 : 20) ? x : null);
  if (!d[0] && !d[1]) return null;
  const rt = safeRt(), key = [iso, Math.floor(now.mins), rt && rt.at, d.map(x => x ? x.src + x.sec : "-").join(",")].join("|");
  const c = inferred[code];
  if (c && c.key === key && c.base === base) return c;
  let list = null; try { list = ttTrips(code, iso); } catch(e){}
  if (!list) return null;
  const sec = now.mins * 60, map = new Map(base || []), info = new Map();
  for (const r of list){
    if (!r.p || r.s + r.p.end < sec - 600 || r.s > sec + 90 * 60) continue;
    const id = `${code}t${r.s}p${r.pi}`; if (map.has(id)) continue;                    // LTA's own word on this train wins
    if (r.tid && rt && rt.trips && rt.trips[r.tid] && liveFresh()) continue;            // listed by the feed as on time
    const x = d[r.p.d > 0 ? 0 : 1]; if (!x) continue;
    const v = Math.max(-1, Math.min(x.src === "live" ? 15 : 4, x.sec / 60));
    map.set(id, v); info.set(id, x);
  }
  return inferred[code] = {key, base, map: info.size ? map : base, info};
}
let inNote = false;
const origShifts = W.rtShifts;
if (typeof origShifts === "function"){
  W.rtShifts = (code, iso) => {
    const base = origShifts(code, iso);
    if (inNote || W.mrtSmartOff) return base;
    try { const x = inferFor(code, iso, base); return x ? x.map : base; } catch(e){ return base; }
  };
  const origNote = W.rtTrainNote;
  if (typeof origNote === "function") W.rtTrainNote = (code, t) => { inNote = true; try { return origNote(code, t); } finally { inNote = false; } };
}
/* A line for a train's card when its time is inferred rather than from LTA's feed. */
W.smartTrainNote = (code, t) => {
  try {
    if (!t || !t.id) return "";
    const c = inferred[code], x = c && c.info.get(t.id); if (!x) return "";
    const late = x.sec >= 0 ? "late" : "early";
    if (x.src === "live") return `<small class="posnote">⏱️ Shown about ${fmtDelay(x.sec)} ${late} · <b>STRONG INFERENCE</b> <span class="muted">(LTA's live feed has nothing on this train, but ${x.n} other ${esc2(short(code))} trains this way are running about ${fmtDelay(x.sec)} ${late})</span></small>`;
    return `<small class="posnote">⏱️ Shown about ${fmtDelay(x.sec)} ${late} · <b>POSSIBLE</b> <span class="muted">(LTA's live feed is down; on this device ${esc2(short(code))} trains this way usually run about that ${late} at this hour, from ${x.n} readings)</span></small>`;
  } catch(e){ return ""; }
};

/* ---------- shared: when to leave ---------- */
function stationIndex(code, fromCode, dir, n){
  const L = LINES[code];
  return L.stations.findIndex((st, j) => st[0] === fromCode && j < n && (dir ? j > 0 : j < n - 1));
}
/* The latest train from fromCode (line, dir) that gets you there by `by` (clock minutes), given the ride after
   boarding (rideAfter, minutes) and a safety margin (pad, minutes). */
function latestTrain(line, dir, fromCode, rideAfter, pad, by){
  const now = sgNow(), L = LINES[line], n = activeStations(L, now.iso).length;
  const i = stationIndex(line, fromCode, dir, n); if (i < 0) return null;
  const ms = nextArrivals(line, i, dir, now, 90) || [];
  let best = null, first = null;
  for (const m of ms){
    const dep = now.mins + m, arr = dep + rideAfter + pad;
    if (!first) first = {dep, arr};
    if (arr <= by) best = {dep, arr, wait: m}; else break;
  }
  return {best, first, last: ms.length ? now.mins + ms[ms.length - 1] : null};
}
function parseBy(raw){
  const q = String(raw || "").toLowerCase();
  const m = q.match(/\b(?:by|before|at|for|until|latest)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/) || q.match(/\b(\d{1,2})(?:[:.](\d{2}))\s*(am|pm)?\b/) || q.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (!m) return null;
  let h = +m[1], mm = m[2] && /^\d{2}$/.test(m[2]) ? +m[2] : 0; const ap = (m[3] || (m[2] && !/^\d{2}$/.test(m[2]) ? m[2] : "") || "").replace(/\./g, "");
  if (h > 23 || mm > 59) return null;
  if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0;
  const now = sgNow().mins % 1440;
  let t = h * 60 + mm;
  if (!ap && h <= 12 && t < now - 30 && t + 720 > now) t += 720;                         // "by 8" in the evening means 8pm
  return t;
}
function routePad(legs){
  let pad = 0; const why = [];
  const wet = (() => { try { return typeof wetNow === "function" ? wetNow() : []; } catch(e){ return []; } })();
  for (const l of legs) if (l.line){
    const d = lineDelay(l.line, l.dir);
    if (d && d.sec > 30 && l === legs.filter(x => x.line).slice(-1)[0]){ pad += d.sec / 60; why.push(`${short(l.line)} trains running about ${fmtDelay(d.sec)} late${d.src === "live" ? " (LTA live)" : " (usual for this hour)"}`); }
    if (wet.length && l.fromCode && l.toCode){
      const st = LINES[l.line].stations.map(s => s[0]), a = st.indexOf(l.fromCode), b = st.indexOf(l.toCode);
      if (a >= 0 && b >= 0){
        const lo = Math.min(a, b), hi = Math.max(a, b);
        const k = wet.filter(w => w.code === l.line && (() => { const x = st.indexOf(w.a), y = st.indexOf(w.b); return Math.min(x, y) >= lo && Math.max(x, y) <= hi; })()).length;
        if (k){ pad += k * 6 / 60; why.push(`${k} wet stretch${k > 1 ? "es" : ""} on the ${short(l.line)}`); }
      }
    }
  }
  const changes = legs.filter(l => l.line).length - 1;
  if (changes > 0){ pad += changes; why.push(`${changes} change${changes > 1 ? "s" : ""}`); }
  return {pad: Math.round(pad * 10) / 10, why};
}

/* ---------- 2. smarter Ask ---------- */
function linesFromScan(sc){
  const out = new Set();
  try { for (const k of sc.lines || []) for (const c of aCodesOf(k)) out.add(c); } catch(e){}
  try { for (const e of sc.stations || []) for (const x of e.codes) out.add(x.line); } catch(e){}
  return [...out].filter(c => LINES[c]);
}
function delayText(codes){
  const lines = [];
  for (const c of codes){
    const parts = [];
    for (const dir of [0, 1]){
      const d = lineDelay(c, dir); if (!d) continue;
      let to = ""; try { to = dest(LINES[c], dir, activeStations(LINES[c], sgNow().iso)); } catch(e){}
      const how = Math.abs(d.sec) < 30 ? "on time" : `about ${fmtDelay(d.sec)} ${d.sec > 0 ? "late" : "early"}`;
      parts.push(`toward ${to || (dir ? "one end" : "the other end")}: ${how}`);
      if (d.src === "learned") parts[parts.length - 1] += ` (usual for this hour, from ${d.n} readings; LTA's live feed isn't reachable now)`;
    }
    if (parts.length) lines.push(`**${lineName(c)}** – ${parts.join("; ")}${liveFresh() ? " (LTA live feed)" : ""}.`);
    else if (liveFresh()) lines.push(`**${lineName(c)}** – LTA's live feed has no delays listed for trains running now.`);
  }
  if (!lines.length) return `LTA's live train feed isn't reachable here${W.APP ? " right now" : " (it comes through the MRT Tracker phone app)"}, and this device hasn't learned enough yet to say how late trains usually run.`;
  return lines.join("\n");
}
function wetText(){
  let w = []; try { w = typeof wetNow === "function" ? wetNow() : []; } catch(e){}
  if (!w.length) return "The rails are dry: NEA's rain gauges don't show rain on the above-ground stretches of the North-South, East-West or Changi Airport lines right now (or the wet-rail slowdown is turned off in the weather card).";
  const by = {}; for (const x of w) (by[x.code] = by[x.code] || []).push(x);
  return `🌧️ Wet rails on ${w.length} above-ground stretch${w.length > 1 ? "es" : ""}:\n` + Object.keys(by).map(c => `- **${lineName(c)}**: ${by[c].slice(0, 4).map(x => `${NAME_OF[x.a] || x.a}–${NAME_OF[x.b] || x.b}`).join(", ")}${by[c].length > 4 ? ` and ${by[c].length - 4} more` : ""}`).join("\n") + "\nTrains there are shown a few seconds slower per station (POSSIBLE: the amount is the app's estimate). They glow blue on the map.";
}
function reliabilityText(codes){
  const now = sgNow(), L = learnStore(), out = [];
  const t = /\d/.test(S.lastQ || "") ? parseBy(S.lastQ) : null;
  const h = t != null ? hourOf(t) : hourOf(now.mins);
  for (const c of codes) for (const dir of [0, 1]){
    const b = L[`${c}|${dir}|${dayType(now.iso)}|${h}`]; if (!Array.isArray(b) || b.length < 3) continue;
    let to = ""; try { to = dest(LINES[c], dir, activeStations(LINES[c], now.iso)); } catch(e){}
    const m = med(b), late2 = b.filter(x => x >= 120).length;
    out.push(`**${short(c)}** toward ${to}: usually ${Math.abs(m) < 30 ? "on time" : `about ${fmtDelay(m)} ${m > 0 ? "late" : "early"}`} around ${clockText(h * 60)}${late2 ? `; 2+ min late in ${Math.round(late2 / b.length * 100)}% of readings` : ""} (${b.length} readings).`);
  }
  return out.length ? out.join("\n") + "\nLearned on this device from LTA's live feed, in dry weather." : "This device hasn't seen enough of LTA's live feed for that line and hour yet. It learns while the app is open with the live feed on, so ask again in a few days.";
}
function leaveText(q, sc, now){
  const st = sc.stations || []; if (st.length < 2) return null;
  const a = sc.from || st[0], b = st.find(e => e !== a); if (!b) return null;
  const by = parseBy(q); if (by == null) return null;
  const r = aRoute(a, b, now); if (!r || !r.legs.length) return `I couldn't find a train route from ${a.name} to ${b.name}.`;
  const first = r.legs.find(l => l.line); if (!first) return null;
  const rideAfter = r.legs.slice(r.legs.indexOf(first)).reduce((s, l) => s + (l.mins || 0), 0);
  const {pad, why} = routePad(r.legs);
  const x = latestTrain(first.line, first.dir, first.fromCode, rideAfter, pad, by);
  if (!x) return null;
  const head = `To reach **${b.name}** by **${clockText(by)}**:`;
  if (!x.best){
    if (x.first) return `${head} the next train from ${a.name} gets you there about ${clockText(x.first.arr)} at the earliest, so you'd be about ${Math.max(1, Math.round(x.first.arr - by))} min late.`;
    return `${head} there are no more trains from ${a.name} on that route today.`;
  }
  if (x.last != null && by > x.last + rideAfter + pad + 30) return `${head} that's further ahead than the app plans. Trains on the ${short(first.line)} run about every ${Math.round(ttHeadway(first.line, now) || 5)} min, so leave ${a.name} about ${Math.round(rideAfter + pad + 5)} min before ${clockText(by)}.`;
  return `${head}\n- Catch the **${clockText(x.best.dep)}** ${short(first.line)} train from ${a.name} ${(() => { try { return "toward " + dest(LINES[first.line], first.dir, activeStations(LINES[first.line], now.iso)); } catch(e){ return ""; } })()}${x.best.wait < 1 ? " (it's due now)" : ` (in ${Math.round(x.best.wait)} min)`}.\n- Be on the platform by **${clockText(x.best.dep - 2)}**; you'd arrive about **${clockText(x.best.arr)}**.\n- The ride is about ${Math.round(rideAfter)} min${r.changes ? ` with ${r.changes} change${r.changes > 1 ? "s" : ""}` : ""}${why.length ? `, plus a ${Math.max(1, Math.round(pad))} min margin for ${why.join(", ")}` : ""}.`;
}
function headsUpText(){
  const items = headsUp();
  if (!items.length) return `Nothing to flag for ${favs().length ? "your stations" : "now (add your stations on Home and I'll watch them)"}.`;
  return items.map(i => `- ${i.icon} ${i.text.replace(/<[^>]+>/g, "")}`).join("\n");
}
if (typeof aBuiltin === "function"){
  const orig = W.aBuiltin;
  W.aBuiltin = q => {
    let base = null;
    const run = () => base || (base = orig(q));
    try {
      if (W.mrtSmartOff) return run();
      S.lastQ = q;
      const n = aNorm(q), sc = aScan(q), now = sgNow();
      const out = (text, extra) => { const b = run(); return {text, acts: (extra || b.acts || []).slice(0, 3)}; };
      if (/\b(leave|leaving|set off|depart|go|start|catch|take)\b|\b(arrive|reach|get there|get to|be at|be in|make it)\b/.test(n) && (sc.stations || []).length >= 2 && parseBy(q) != null){
        const t = leaveText(q, sc, now); if (t) return out(t);
      }
      if (/\bwet\b|\bslipp\w*|\b(rain\w*|wet)\b.*\b(rails?|tracks?|trains?)\b.*\b(slow\w*|wet|affect\w*)\b|\b(rails?|tracks?)\b.*\b(rain\w*|wet)\b/.test(n)) return out(wetText());
      if (/\b(heads? up|anything (i should|to) know|my stations|watch(ing)? my|smart alerts?|any alerts? for me|what should i know)\b/.test(n)) return out(headsUpText());
      const codes = linesFromScan(sc);
      if (/\b(reliab\w*|punctual\w*|usually (late|delayed|on time)|normally (late|delayed)|always late|how often (is it|are they) late)\b/.test(n) && codes.length) return out(reliabilityText(codes.slice(0, 2)));
      if (/\b(late|delay\w*|on time|slow\w*|running behind|behind schedule|lag\w*)\b/.test(n)){
        const b = run();
        const cs = codes.length ? codes.slice(0, 3) : ["NSL", "EWL", "NEL", "CCL", "DTL", "TEL"].filter(c => { const d0 = lineDelay(c, 0), d1 = lineDelay(c, 1); return (d0 && d0.sec >= 60) || (d1 && d1.sec >= 60); });
        const extra = codes.length || cs.length ? delayText(cs) : (liveFresh() ? "LTA's live feed shows MRT trains running about on time." : "");
        return {text: extra ? `${b.text}\n\n${extra}` : b.text, acts: b.acts};
      }
    } catch(e){}
    return run();
  };
  try {
    if (Array.isArray(A_SUGG)) A_SUGG.unshift("When should I leave Bishan to reach Raffles Place by 9am?", "Are the trains running late?", "Are the rails wet?");
  } catch(e){}
}

/* ---------- 3. proactive alerts: "Heads up" on Home ---------- */
const favs = () => { try { const f = store.get("mrt.favs", []); return (Array.isArray(f) ? f : []).map(n => aByName(n)).filter(Boolean); } catch(e){ return []; } };
function headsUp(){
  const out = [], seen = new Set(), now = sgNow(), wet = wetLines(), al = safeAlert();
  const add = (key, icon, text, level) => { if (!seen.has(key)){ seen.add(key); out.push({icon, text, level}); } };
  for (const e of favs()){
    try {
      if (al && al.status === 2 && aDisrupted(e)) add("dis|" + e.name, "⚠️", `<b>Disruption</b> affecting ${esc2(e.name)}. Open Updates for LTA's message and free buses.`, 3);
      for (const x of e.codes){
        const c = x.line;
        for (const dir of [0, 1]){
          const d = lineDelay(c, dir);
          if (d && d.src === "live" && d.sec >= 120) add(`late|${c}|${dir}`, "⏱️", `<b>${esc2(short(c))} trains running about ${fmtDelay(d.sec)} late</b> ${(() => { try { return "toward " + esc2(dest(LINES[c], dir, activeStations(LINES[c], now.iso))); } catch(e){ return ""; } })()} (LTA live feed).`, 2);
        }
        if (wet.has(c)) add("wet|" + c, "🌧️", `<b>Wet rails on the ${esc2(short(c))}</b>: trains there are running a little slower in the rain.`, 1);
      }
      for (const row of aStationTrains(e, now, 3)){
        if (!row.mins || row.opens) continue;
        const to = row.toward || "", m0 = row.mins[0];
        let hw = null; try { hw = ttHeadway(row.line, now); } catch(e){}
        if (m0 != null && m0 >= Math.max(12, (hw || 5) * 2.2) && (row.last == null || now.mins + m0 <= row.last + 1))
          add(`gap|${e.name}|${row.line}|${row.dir}`, "⌛", `<b>Long wait at ${esc2(e.name)}</b>: next ${esc2(short(row.line))} train toward ${esc2(to)} in ${Math.round(m0)} min.`, 1);
        if (row.last != null && row.last >= now.mins && row.last - now.mins <= 30)
          add(`last|${e.name}|${row.line}|${row.dir}`, "🌙", `<b>Last train</b> from ${esc2(e.name)} toward ${esc2(to)} at ${clockText(row.last)} (in ${Math.max(0, Math.round(row.last - now.mins))} min).`, 2);
      }
    } catch(err){}
  }
  return out.sort((a, b) => b.level - a.level).slice(0, 6);
}
function paintHeadsUp(){
  try {
    const home = document.querySelector("#viewHome .home"); if (!home) return;
    let el = document.getElementById("smartHeads");
    if (!el){ el = document.createElement("section"); el.id = "smartHeads"; el.className = "smart-heads"; el.setAttribute("aria-live", "polite"); home.insertBefore(el, home.firstChild); }
    const items = W.mrtSmartOff ? [] : headsUp();
    el.hidden = !items.length;
    const html = items.length ? `<div class="sh-h"><b>Heads up</b><span>for your stations</span></div><ul>${items.map(i => `<li class="lv${i.level}"><span>${i.icon}</span><span>${i.text}</span></li>`).join("")}</ul>` : "";
    if (el._h !== html){ el.innerHTML = html; el._h = html; }
  } catch(e){}
}
if (typeof W.homeRender === "function"){
  const h = W.homeRender;
  W.homeRender = function(){ const o = h.apply(this, arguments); paintHeadsUp(); return o; };
}
setInterval(() => { if (!document.hidden) paintHeadsUp(); }, 30e3);
setTimeout(paintHeadsUp, 3000);
W.mrtHeadsUp = headsUp;

/* ---------- 4. smarter trip planner ---------- */
W.tripSmart = r => {
  try {
    if (!r || !r.legs || W.mrtSmartOff) return "";
    const legs = r.legs.filter(l => l.line);
    const {pad, why} = routePad(r.legs.map(l => l.line ? {line: l.line, dir: l.dir, fromCode: l.fromCode, toCode: l.toCode} : l));
    const delayWhy = why.filter(w => !/\bchanges?$/.test(w));
    const now = sgNow();
    const def = (() => { const t = Math.ceil((now.mins % 1440 + 45) / 15) * 15; return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; })();
    return `<div class="rt-smart">
      ${delayWhy.length ? `<p><b>Expect about ${Math.max(1, Math.round(pad - Math.max(0, legs.length - 1)))} min extra</b>: ${esc2(delayWhy.join("; "))}.</p>` : ""}
      <div class="rt-arr"><label>Arrive by <input type="time" data-smart-by value="${S.by || def}"></label><button type="button" class="btn ghost" data-smart-leave>When to leave</button></div>
      <p class="rt-smart-out" data-smart-out>${S.by && S.byRoute === r.from + ">" + r.to ? (() => { try { return W.tripSmartLeave(r, byMins(S.by)); } catch(e){ return ""; } })() : ""}</p>
    </div>`;
  } catch(e){ return ""; }
};
function byMins(v){
  const m = String(v || "").match(/^(\d{1,2}):(\d{2})/); if (!m) return null;
  let by = +m[1] * 60 + +m[2]; const nowM = sgNow().mins;
  if (by < nowM % 1440 - 60) by += 1440;                                                    // after midnight
  return by + nowM - nowM % 1440;
}
W.tripSmartLeave = (r, by) => {
  const legs = r.legs, first = legs.find(l => l.line); if (!first) return "No train on this route.";
  const now = sgNow();
  const rideAfter = r.firstWait != null ? Math.max(1, r.arrive - (now.mins + r.firstWait)) : legs.reduce((s, l) => s + (l.mins || l.ride || 0), 0);
  const {pad, why} = routePad(legs.map(l => l.line ? {line: l.line, dir: l.dir, fromCode: l.fromCode, toCode: l.toCode} : {}));
  const padX = Math.max(0, pad - Math.max(0, legs.filter(l => l.line).length - 1));       // the planner already times the changes
  const x = latestTrain(first.line, first.dir, first.fromCode, rideAfter, padX, by);
  if (!x || (!x.best && !x.first)) return "No more trains on this route today.";
  if (!x.best) return `The next train gets you to ${esc2(r.to)} about <b>${clockText(x.first.arr)}</b>, about ${Math.max(1, Math.round(x.first.arr - by))} min after ${clockText(by)}.`;
  return `Catch the <b>${clockText(x.best.dep)}</b> train from ${esc2(r.from)}${x.best.wait < 1 ? " (due now)" : ` (in ${Math.round(x.best.wait)} min)`}: be on the platform by <b>${clockText(x.best.dep - 2)}</b>, arrive about ${clockText(x.best.arr)}${padX >= 0.5 ? ` (allowing ${Math.round(padX * 60) < 90 ? Math.round(padX * 60) + " s" : Math.round(padX) + " min"} for ${esc2(why.filter(w => !/\bchanges?$/.test(w)).join(", "))})` : ""}.`;
};
document.addEventListener("click", ev => {
  const b = ev.target.closest && ev.target.closest("[data-smart-leave]"); if (!b) return;
  try {
    const box = b.closest(".rt-smart"), inp = box.querySelector("[data-smart-by]"), out = box.querySelector("[data-smart-out]");
    const v = String(inp.value || ""), by = byMins(v); if (by == null){ out.textContent = "Pick a time."; return; }
    const r = W.mrtTripRoute ? W.mrtTripRoute() : null;
    if (r){ S.by = v; S.byRoute = r.from + ">" + r.to; }
    out.innerHTML = r ? W.tripSmartLeave(r, by) : "Show a route first.";
  } catch(e){}
});

/* styles */
const css = document.createElement("style");
css.textContent = `
.smart-heads{background:var(--panel);border:1px solid var(--rule);border-left:5px solid var(--warn,#f59e0b);border-radius:14px;padding:10px 12px;margin:4px 0 12px}
.smart-heads[hidden]{display:none}
.smart-heads .sh-h{display:flex;gap:8px;align-items:baseline;margin-bottom:4px}
.smart-heads .sh-h b{font-size:15px}.smart-heads .sh-h span{color:var(--muted);font-size:12px}
.smart-heads ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.smart-heads li{display:grid;grid-template-columns:22px 1fr;gap:6px;font-size:13.5px;line-height:1.35}
.smart-heads li b{font-weight:600}
.rt-smart{border:1px solid var(--rule);border-radius:10px;padding:8px 10px;margin:8px 0;font-size:13px}
.rt-smart p{margin:0 0 6px}
.rt-smart .rt-arr{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.rt-smart input[type=time]{font:inherit;padding:6px 8px;border-radius:8px;border:1px solid var(--rule);background:var(--bg);color:var(--fg);margin-left:6px}
.rt-smart-out:empty{display:none}.rt-smart-out{margin-top:6px!important}`;
(document.head || document.documentElement).appendChild(css);
W.mrtSmart = {lineDelay, learned, liveByLine, headsUp, latestTrain, parseBy, sample, store: learnStore};
}
})();

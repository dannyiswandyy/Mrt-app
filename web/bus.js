/* MRT Tracker – buses at MRT stations (the same file in the app and the website).
   On a station's card (the map card on tablets and computers, the sheet on phones): the bus stops next to the
   station and any bus interchange nearby, with LTA's live bus arrivals (LTA DataMall, Bus Arrival v3):
   - for each bus service, the next three buses in minutes ("Arr" when it's pulling in),
   - "departs" when the stop is where the service starts (interchanges and terminals), "ends here" when it's
     where it finishes,
   - how full each bus is (seats / standing / limited standing) and double-deck or bendy buses,
   - a time in italics when LTA has no GPS on that bus (scheduled, not live).
   Which stops: LTA's list of bus stops (DataMall Bus Stops), fetched once and kept for 14 days; stops within about
   300 m of the station, nearest first (up to 4), plus any bus interchange within about 600 m, plus stops named
   after the station up to 1.5 km away (Changi Airport's are at the terminals: PTB1, PTB2…).
   Hidden unless window.MRT_DEV_FEATURES is true (test builds), while it's being tried out. In the phone app the app adds the
   LTA key (window.MrtApp); on the website it goes through the data relay (worker/: /lta/BusArrival, /lta/BusStops). */
(() => {
"use strict";
const W = window;
const ready = () => { try { return typeof aByName === "function" && typeof wxXY === "function" && typeof store === "object" && document.getElementById("mapInfo"); } catch(e){ return false; } };
let tries = 0;
(function wait(){ if (ready()) { try { init(); } catch(e){ try { console.warn("bus.js", e); } catch(_){} } } else if (++tries < 300) setTimeout(wait, 200); })();

function init(){
if (W.mrtBus) return;
const on = () => W.MRT_DEV_FEATURES === true && !W.mrtBusOff;
const STOPS_KEY = "mrt.bus.stops", STOPS_DAYS = 14, NEAR_M = 300, INT_M = 600, NAMED_M = 1500, MAX_STOPS = 4, ARR_TTL = 25e3;
const B = {stops: null, loading: null, err: "", arr: {}, busy: {}, near: {}, loops: null, loopsLoading: null};
const LOOPS_KEY = "mrt.bus.loops";
const escH = s => { try { return esc(s); } catch(e){ return String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c])); } };
const app = () => { try { return !!(typeof APP !== "undefined" && APP && typeof APP.fetch === "function" && typeof nativeGet === "function"); } catch(e){ return false; } };
const relay = () => { try { return (W.MRT_WEB_CONFIG && W.MRT_WEB_CONFIG.proxy) || ""; } catch(e){ return ""; } };
const isInt = d => /\b(int|interchange|bus interchange|integrated transport hub|ith|bus terminal|ter)\b/i.test(d || "");

/* one LTA DataMall call: through the app (it adds the key) or the website's relay */
async function lta(path){
  if (app()){
    const {code, body} = await nativeGet("https://datamall2.mytransport.sg/ltaodataservice/" + path, true);
    if (code !== 200) throw new Error("LTA answered " + code);
    return JSON.parse(body);
  }
  const px = relay(); if (!px) throw new Error("no LTA access here");
  const m = path.match(/^(?:v3\/)?(BusArrival|BusStops|BusRoutes)\?(.*)$/); if (!m) throw new Error("not allowed");
  const r = await fetch(`${px}/lta/${m[1]}?${m[2]}`, {cache: "no-store"});
  if (!r.ok) throw new Error("relay answered " + r.status);
  return r.json();
}

/* ---------- LTA's bus stops (kept 14 days) ---------- */
function stopsFromStore(){
  const v = store.get(STOPS_KEY, null);
  if (v && Array.isArray(v.list) && v.list.length > 1000 && Date.now() - v.at < STOPS_DAYS * 864e5) return v.list;
  return null;
}
function loadStops(){
  if (B.stops) return Promise.resolve(B.stops);
  const kept = stopsFromStore(); if (kept){ B.stops = index(kept); return Promise.resolve(B.stops); }
  if (B.loading) return B.loading;
  B.loading = (async () => {
    const list = [];
    for (let skip = 0; skip < 12000; skip += 500){
      const j = await lta("BusStops?$skip=" + skip), v = (j && j.value) || [];
      for (const s of v) if (s.BusStopCode && isFinite(s.Latitude) && isFinite(s.Longitude) && s.Latitude) list.push([String(s.BusStopCode), String(s.Description || ""), String(s.RoadName || ""), +(+s.Latitude).toFixed(6), +(+s.Longitude).toFixed(6)]);
      if (v.length < 500) break;
    }
    if (list.length < 1000) throw new Error("LTA's bus stop list came back short");
    store.set(STOPS_KEY, {at: Date.now(), list});
    B.stops = index(list); B.err = "";
    return B.stops;
  })().catch(e => { B.err = String(e && e.message || e); B.loading = null; throw e; });
  return B.loading;
}
function index(list){
  const byCode = new Map();
  const pts = list.map(s => { const [x, y] = wxXY(s[3], s[4]); const o = {code: s[0], desc: s[1], road: s[2], x, y, int: isInt(s[1])}; byCode.set(o.code, o); return o; });
  return {pts, byCode};
}

/* ---------- which way each loop service goes ----------
   LTA's bus arrivals don't say, so from LTA's bus routes (DataMall Bus Routes, every stop of every service; about 50
   requests, once, kept 14 days): for each service that starts and ends at the same stop, the stop furthest from the
   start, and the compass direction to it. Shown as "loop · north via Bishan St 22". */
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
function loopsFromStore(){
  const v = store.get(LOOPS_KEY, null);
  return v && v.map && typeof v.map === "object" && Date.now() - v.at < STOPS_DAYS * 864e5 ? v.map : null;
}
function loadLoops(){
  if (B.loops) return Promise.resolve(B.loops);
  const kept = loopsFromStore(); if (kept){ B.loops = kept; return Promise.resolve(kept); }
  if (B.loopsLoading) return B.loopsLoading;
  B.loopsLoading = (async () => {
    await loadStops();
    const runs = new Map();                            // "service|direction" -> [[sequence, stop code]]
    for (let skip = 0; skip < 60000; skip += 500){
      const j = await lta("BusRoutes?$skip=" + skip), v = (j && j.value) || [];
      for (const r of v){ const k = r.ServiceNo + "|" + r.Direction; let a = runs.get(k); if (!a) runs.set(k, a = []); a.push([+r.StopSequence, String(r.BusStopCode)]); }
      if (v.length < 500) break;
    }
    if (runs.size < 100) throw new Error("LTA's bus routes came back short");
    const map = {};
    for (const [k, a] of runs){
      a.sort((x, y) => x[0] - y[0]);
      const [svc, dir] = k.split("|"), o = B.stops.byCode.get(a[0][1]);
      if (!o || a[0][1] !== a[a.length - 1][1] || (map[svc] && dir !== "1")) continue;      // only loops; direction 1 first
      let far = null, fd = -1;
      for (const [, c] of a){ const st = B.stops.byCode.get(c); if (!st) continue; const d = Math.hypot(st.x - o.x, st.y - o.y); if (d > fd){ fd = d; far = st; } }
      if (!far || fd < 150) continue;
      const deg = (Math.atan2(far.x - o.x, -(far.y - o.y)) * 180 / Math.PI + 360) % 360;   // map y grows southward
      map[svc] = [COMPASS[Math.round(deg / 45) % 8], far.road || far.desc, Math.round(fd / 100) / 10];
    }
    store.set(LOOPS_KEY, {at: Date.now(), map});
    return B.loops = map;
  })().catch(e => { B.loopsLoading = null; B.loopsErr = String(e && e.message || e); return null; });
  return B.loopsLoading;
}
const loopText = svc => {
  const l = B.loops && B.loops[svc];
  if (!l){ if (!B.loops && !B.loopsLoading && !B.loopsErr) loadLoops().then(() => { if (want) paint(want); }); return "loop"; }
  return `loop · <b>${escH(l[0])}</b> via ${escH(l[1])}`;
};

/* ---------- the stops for a station ---------- */
function stopsNear(name){
  if (B.near[name]) return B.near[name];
  const e = aByName(name); if (!e || !B.stops) return [];
  const here = [[e.x, e.y], ...(e.pts || [])];
  const d = s => Math.min(...here.map(p => Math.hypot(s.x - p[0], s.y - p[1])));
  // stops named after the station count from further away (Changi Airport's are at the terminals: "Changi Airport PTB1")
  const nm = name.toLowerCase().replace(/\s*\(.*\)\s*/g, "").trim(), named = st => nm.length >= 4 && st.desc.toLowerCase().includes(nm);
  const all = B.stops.pts.map(s => ({s, d: d(s)})).filter(x => x.d <= (named(x.s) ? NAMED_M : INT_M)).sort((a, b) => a.d - b.d);
  const ints = all.filter(x => x.s.int).slice(0, 2);
  const byName = all.filter(x => !x.s.int && named(x.s) && x.d > NEAR_M).slice(0, 4);
  const near = all.filter(x => !x.s.int && x.d <= NEAR_M).slice(0, MAX_STOPS);
  const seen = new Set(), out = [];
  for (const x of [...ints, ...near, ...byName]) if (!seen.has(x.s.code)){ seen.add(x.s.code); out.push(x); }
  return B.near[name] = out.slice(0, 8).map(x => ({...x.s, dist: Math.round(x.d)}));
}

/* ---------- arrivals at a stop ---------- */
async function arrivals(code){
  const c = B.arr[code]; if (c && Date.now() - c.at < ARR_TTL) return c;
  if (B.busy[code]) return B.busy[code];
  B.busy[code] = lta("v3/BusArrival?BusStopCode=" + encodeURIComponent(code)).then(j => {
    const out = {at: Date.now(), services: (j && j.Services || []).map(s => ({no: s.ServiceNo, op: s.Operator, buses: [s.NextBus, s.NextBus2, s.NextBus3].filter(b => b && b.EstimatedArrival)}))};
    out.services.sort((a, b) => String(a.no).localeCompare(String(b.no), undefined, {numeric: true}));
    return B.arr[code] = out;
  }).catch(e => (B.arr[code] = {at: Date.now(), err: String(e && e.message || e), services: (c && c.services) || []})).finally(() => { B.busy[code] = null; });
  return B.busy[code];
}

/* ---------- drawing ---------- */
const LOAD = {SEA: ["seats", "b-l1"], SDA: ["standing", "b-l2"], LSD: ["full", "b-l3"]};
const TYPE = {DD: "double deck", BD: "bendy"};
function busTime(b){
  const m = (Date.parse(b.EstimatedArrival) - Date.now()) / 60e3;
  const t = m <= 0.5 ? "Arr" : Math.round(m) + "";
  const ld = LOAD[b.Load] || null, live = String(b.Monitored) !== "0";
  return `<span class="b-t ${ld ? ld[1] : ""}${live ? "" : " b-sched"}" title="${escH([ld ? ld[0] : "", TYPE[b.Type] || "", live ? "live" : "scheduled (no GPS)", b.Feature === "WAB" ? "wheelchair accessible" : ""].filter(Boolean).join(" · "))}">${t}${TYPE[b.Type] === "double deck" ? "<sup>DD</sup>" : b.Type === "BD" ? "<sup>B</sup>" : ""}</span>`;
}
function stopHTML(s){
  const a = B.arr[s.code];
  const head = `<div class="b-stop"><b>${escH(s.desc)}</b><span>${escH(s.code)} · ${escH(s.road)}${s.int ? " · <b>interchange</b>" : ""} · ${s.dist} m</span></div>`;
  if (!a) return head + `<p class="b-msg">Loading buses…</p>`;
  if (a.err && !a.services.length) return head + `<p class="b-msg">Couldn't get bus times (${escH(a.err)}).</p>`;
  if (!a.services.length) return head + `<p class="b-msg">No buses due here now.</p>`;
  const rows = a.services.map(sv => {
    const b0 = sv.buses[0] || {}, dest = B.stops && B.stops.byCode.get(String(b0.DestinationCode || "")), orig = String(b0.OriginCode || "");
    const departs = orig === s.code, ends = !departs && String(b0.DestinationCode || "") === s.code;   // a loop service starts and ends here: it departs
    const tag = departs ? `<span class="b-tag dep">departs</span>` : ends ? `<span class="b-tag end">ends here</span>` : "";
    return `<li><span class="b-no">${escH(sv.no)}</span><span class="b-to">${ends ? "ends here" : dest ? (departs && dest.code === s.code ? loopText(sv.no) : "to " + escH(dest.desc)) : ""}${tag && !ends ? " " + tag : ""}</span><span class="b-ts">${sv.buses.length ? sv.buses.map(busTime).join("") : `<span class="b-t b-none">–</span>`}</span></li>`;
  }).join("");
  return head + `<ul class="b-list">${rows}</ul>`;
}
function boxHTML(name){
  if (!on()) return "";
  const id = "busbox-" + name.replace(/[^a-z0-9]/gi, "");
  let body;
  if (!B.stops) body = B.err ? `<p class="b-msg">Couldn't get LTA's bus stops (${escH(B.err)}).</p>` : `<p class="b-msg">Getting LTA's bus stops… (once every two weeks)</p>`;
  else {
    const st = stopsNear(name);
    body = st.length ? st.map(stopHTML).join("") : `<p class="b-msg">No bus stops within ${NEAR_M} m.</p>`;
  }
  const t = Object.values(B.arr).reduce((m, a) => Math.max(m, a.at || 0), 0);
  return `<details class="bus-box" id="${id}" data-bus="${escH(name)}" open><summary><span>🚌 Buses here</span><small class="b-dev">TEST · LTA live</small></summary>${body}<p class="b-foot">Minutes to each bus. <span class="b-t b-l1">n</span> seats <span class="b-t b-l2">n</span> standing <span class="b-t b-l3">n</span> full · <i>italic</i>: scheduled, no GPS · DD double deck${t ? ` · updated ${new Date(t + 8 * 3600e3).toISOString().slice(11, 16)}` : ""}</p></details>`;
}
/* start loading for a station, then repaint every box showing it */
let want = null;
async function refresh(name){
  if (!on() || !name) return;
  want = name;
  try { await loadStops(); } catch(e){ paint(name); return; }
  paint(name);
  for (const s of stopsNear(name)){ await arrivals(s.code); if (want !== name) return; paint(name); }
}
function paint(name){
  for (const el of document.querySelectorAll(".bus-box")){
    if (el.dataset.bus !== name) continue;
    const open = el.open, html = boxHTML(name);
    if (el._h === html) continue;
    const tmp = document.createElement("div"); tmp.innerHTML = html; const n = tmp.firstElementChild; if (!n) continue;
    n.open = open; n._h = html; el.replaceWith(n);
  }
  const hb = document.getElementById("hxBus");
  if (hb && hb.dataset.name === name){ const h = boxHTML(name); if (hb._h !== h){ hb.innerHTML = h; hb._h = h; } }
}

/* ---------- hooks: the map card (tablets, computers) and the phone sheet ---------- */
const selStation = () => { try { return mSel && mSel.type === "station" ? mSel.name : null; } catch(e){ return null; } };
if (typeof W.mapInfoHTML === "function"){
  const base = W.mapInfoHTML;
  W.mapInfoHTML = function(){
    let h = base.apply(this, arguments);
    try {
      const name = selStation();
      if (on() && name && typeof h === "string" && !/data-act="rt-close"/.test(h)){
        const box = boxHTML(name);
        h = h.includes('<div class="mi-act">') ? h.replace('<div class="mi-act">', box + '<div class="mi-act">') : h + box;
        if (want !== name || Date.now() - (B.lastRefresh || 0) > ARR_TTL){ B.lastRefresh = Date.now(); setTimeout(() => refresh(name), 0); }
      }
    } catch(e){}
    return h;
  };
}
/* The phone sheet is opened from inside the page (a tap on the map, a search result, Home), so watch the sheet
   itself: whenever it shows a station, put "Buses here" in it. */
function syncSheet(){
  try {
    const sheet = document.getElementById("hxSheet"), body = document.getElementById("hxBody"), title = document.getElementById("hxTitle");
    if (!sheet || !body || !title) return;
    let hb = document.getElementById("hxBus");
    if (!hb){ hb = document.createElement("div"); hb.id = "hxBus"; hb.hidden = true; const live = document.getElementById("hxLive"); live && live.nextSibling ? body.insertBefore(hb, live.nextSibling) : body.appendChild(hb); }
    const name = !sheet.hidden && !sheet.classList.contains("hx-train") && aByName(title.textContent.trim()) ? title.textContent.trim() : "";
    if (on() && name){
      if (hb.dataset.name !== name){ hb.dataset.name = name; hb._h = null; hb.innerHTML = boxHTML(name); hb._h = hb.innerHTML; B.lastRefresh = Date.now(); refresh(name); }
      hb.hidden = false;
    } else if (hb.dataset.name || !hb.hidden){ hb.hidden = true; hb.dataset.name = ""; hb.innerHTML = ""; hb._h = null; }
  } catch(e){}
}
{
  const sheet = document.getElementById("hxSheet"), title = document.getElementById("hxTitle");
  if (sheet && title && W.MutationObserver){
    const mo = new MutationObserver(syncSheet);
    mo.observe(sheet, {attributes: true, attributeFilter: ["hidden", "class"]});
    mo.observe(title, {childList: true, characterData: true, subtree: true});
  }
  setInterval(syncSheet, 1500);              // and a slow check, in case the sheet changes some other way
}
/* keep the open card's times fresh: every 30 s while a station card or sheet is showing */
setInterval(() => {
  if (!on() || document.hidden) return;
  const hb = document.getElementById("hxBus"), sheet = document.getElementById("hxSheet");
  const name = (hb && hb.dataset.name && sheet && !sheet.hidden) ? hb.dataset.name : (document.querySelector("#mapInfo .bus-box") ? selStation() : null);
  if (name){ B.lastRefresh = Date.now(); refresh(name); }
}, 30e3);

const css = document.createElement("style");
css.textContent = `
.bus-box{border:1px solid var(--rule);border-radius:12px;margin:10px 0 6px;padding:2px 10px 8px;background:var(--panel)}
.bus-box summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0 4px;font-weight:700}
.bus-box summary::-webkit-details-marker{display:none}
.bus-box .b-dev{font:700 9.5px var(--mono,monospace);color:var(--muted);letter-spacing:.04em}
.bus-box .b-stop{display:flex;flex-direction:column;margin:8px 0 4px}
.bus-box .b-stop b{font-size:13.5px}.bus-box .b-stop span{font-size:11.5px;color:var(--muted)}
.bus-box .b-list{list-style:none;margin:0;padding:0;display:grid;gap:3px}
.bus-box .b-list li{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:6px;align-items:center;font-size:13px;padding:3px 0;border-top:1px solid color-mix(in srgb,var(--rule) 60%,transparent)}
.bus-box .b-no{font:700 13px var(--mono,monospace);background:var(--soft);border-radius:6px;text-align:center;padding:2px 0}
.bus-box .b-to{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:12px}
.bus-box .b-ts{display:flex;gap:4px}
.bus-box .b-t{display:inline-block;min-width:30px;text-align:center;font:600 12.5px var(--mono,monospace);border-radius:6px;padding:2px 3px;background:var(--soft)}
.bus-box .b-t sup{font-size:7.5px;margin-left:1px}
.bus-box .b-l1{color:#17863f}.bus-box .b-l2{color:#b7791f}.bus-box .b-l3{color:#d14343}
.bus-box .b-sched{font-style:italic;opacity:.8}.bus-box .b-none{opacity:.5}
.bus-box .b-tag{font:700 9.5px var(--body);text-transform:uppercase;letter-spacing:.03em;border-radius:5px;padding:1px 5px;margin-left:4px}
.bus-box .b-tag.dep{background:rgba(23,134,63,.15);color:#17863f}.bus-box .b-tag.end{background:var(--soft);color:var(--muted)}
.bus-box .b-msg{margin:6px 0;color:var(--muted);font-size:12.5px}
.bus-box .b-foot{margin:8px 0 0;color:var(--muted);font-size:10.5px;line-height:1.5}
.bus-box .b-foot .b-t{min-width:0;font-size:10px;padding:0 4px}
#hxBus[hidden]{display:none}#hxBus{padding:0 2px}`;
(document.head || document.documentElement).appendChild(css);
W.mrtBus = {refresh, stopsNear, arrivals, loadStops, loadLoops, state: B};
}
})();

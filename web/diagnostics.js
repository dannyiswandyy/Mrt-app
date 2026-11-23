/* Dev tools → Diagnostics: a log of what the app was doing, to share as a file when something goes wrong.
   Loaded in the page's <head> so it catches errors from the very start. Every entry has a timestamp (Singapore time),
   a level (debug, info, warn, error, crash), a category (js, api, network, gtfs, timetable, trains, disruption, state,
   app, native, webview…) and the session it came from. The log is kept on the phone (about the last 3000 entries,
   across app restarts) and only leaves it when "Share log file" is used. Never put keys or tokens in a message. */
(function(){
  "use strict";
  const KEY = "mrt.dev.diagnostics.v2", OLD = "mrt.dev.diagnostics.v1", MAX = 3000, MAX_BYTES = 1500000;
  const LEVELS = ["debug", "info", "warn", "error", "crash"];
  const rnd = n => { try { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, "0")).join(""); } catch(e){ return Math.random().toString(16).slice(2, 2 + n * 2); } };
  const SESSION = "S-" + Date.now().toString(36).toUpperCase() + "-" + rnd(3).toUpperCase();
  const STARTED = Date.now();
  const app = () => window.MrtApp || null;
  const call = (m, ...a) => { try { const A = app(); return A && typeof A[m] === "function" ? A[m](...a) : undefined; } catch(e){ return undefined; } };
  // 2026-11-15T15:20:01.234+08:00, whatever the phone's time zone
  const sgTime = t => { const d = new Date(t + 8 * 3600000); return d.toISOString().replace("Z", "+08:00"); };
  const text = x => { if (typeof x === "string") return x; if (x instanceof Error) return x.message || String(x); try { return JSON.stringify(x); } catch(e){ return String(x); } };
  // Keys never go in the log, even if one turns up inside a URL or a message.
  const scrub = s => String(s == null ? "" : s).replace(/(AccountKey|api[_-]?key|token|key|secret|password|authorization|bearer)(\s*[=:]\s*["']?|["']\s*:\s*["']?|\s+(?=[A-Za-z0-9+/_-]{20,}))[^\s&"',;]+/gi, "$1$2[hidden]").slice(0, 2000);
  let entries = [], seq = 0, saveTimer = 0, dirty = false;
  const listeners = new Set();

  function load(){
    try {
      const v2 = JSON.parse(localStorage.getItem(KEY) || "null");
      if (v2 && Array.isArray(v2.entries)) { entries = v2.entries; seq = v2.seq || entries.length; return; }
      const v1 = JSON.parse(localStorage.getItem(OLD) || "[]");   // the first version of this log (ts, level, message, meta)
      if (Array.isArray(v1)) entries = v1.map((x, i) => ({n: i + 1, ts: Date.parse(x.ts) || Date.now(), level: x.level || "info", cat: "js", message: String(x.message || ""), meta: x.meta, sid: "earlier"}));
      seq = entries.length;
      localStorage.removeItem(OLD);
    } catch(e){ entries = []; }
  }
  function save(){
    saveTimer = 0; if (!dirty) return; dirty = false;
    try {
      if (entries.length > MAX) entries = entries.slice(-MAX);
      let s = JSON.stringify({seq, entries});
      while (s.length > MAX_BYTES && entries.length > 100){ entries = entries.slice(Math.ceil(entries.length / 4)); s = JSON.stringify({seq, entries}); }
      localStorage.setItem(KEY, s);
    } catch(e){
      try { entries = entries.slice(-Math.floor(entries.length / 2)); localStorage.setItem(KEY, JSON.stringify({seq, entries})); } catch(e2){}
    }
  }
  const saveSoon = now => { dirty = true; if (now){ if (saveTimer) clearTimeout(saveTimer); save(); } else if (!saveTimer) saveTimer = setTimeout(save, 2000); };

  /* push(level, category, message, meta) — or the older push(level, message, meta). The same message again within
     30 seconds is counted on the earlier entry ("×12") instead of filling the log. */
  function push(level, cat, message, meta){
    try {
      if (arguments.length <= 3 && (typeof message !== "string")) { meta = message; message = cat; cat = "js"; }
      level = LEVELS.includes(String(level)) ? String(level) : (String(level) === "warning" ? "warn" : "info");
      const now = Date.now(), msg = scrub(text(message));
      let m;
      if (meta !== undefined){ try { m = JSON.parse(scrub(JSON.stringify(meta)).slice(0, 4000)); } catch(e){ m = scrub(text(meta)).slice(0, 4000); } }
      for (let i = entries.length - 1, k = 0; i >= 0 && k < 25; i--, k++){
        const e = entries[i];
        if (e.sid === SESSION && e.level === level && e.cat === cat && e.message === msg && now - (e.last || e.ts) < 30000){
          e.repeat = (e.repeat || 1) + 1; e.last = now; saveSoon(level === "error" || level === "crash"); emit(e); return e;
        }
      }
      const row = {n: ++seq, ts: now, level, cat: String(cat || "js"), message: msg, sid: SESSION};
      if (m !== undefined) row.meta = m;
      entries.push(row);
      if (entries.length > MAX + 200) entries = entries.slice(-MAX);
      saveSoon(level === "error" || level === "crash");
      emit(row);
      return row;
    } catch(e){ return null; }
  }
  function emit(row){ for (const f of listeners) { try { f(row); } catch(e){} } }

  load();
  push("info", "app", "App started", {session: SESSION, version: call("getVersion") || "", channel: call("getChannel") || "web"});

  // Java crashes from an earlier run (the app closed before the page could log them)
  try {
    const cr = call("diagTakeCrashes");
    if (cr) for (const line of String(cr).split("\n")) { if (!line.trim()) continue; try { const c = JSON.parse(line); push("crash", "native", "App crashed (previous run): " + c.error, {at: c.ts, thread: c.thread, version: c.version, stack: c.stack}); } catch(e){} }
  } catch(e){}

  /* --- errors --- */
  window.addEventListener("error", e => {
    const t = e.target;
    if (t && t !== window && (t.src || t.href)) { push("error", "js", `Couldn't load ${t.tagName.toLowerCase()} ${String(t.src || t.href).split("?")[0].split("/").pop()}`); return; }
    push("error", "js", e.message || "JavaScript error", {file: String(e.filename || "").split("/").pop(), line: e.lineno || 0, col: e.colno || 0, stack: e.error && e.error.stack ? String(e.error.stack).slice(0, 3000) : ""});
  }, true);
  window.addEventListener("unhandledrejection", e => push("error", "js", "Unhandled promise rejection: " + text(e.reason && e.reason.message || e.reason), {stack: String(e.reason && e.reason.stack || "").slice(0, 3000)}));
  const oe = console.error.bind(console), ow = console.warn.bind(console);
  console.error = (...a) => { push("error", "console", a.map(text).join(" ")); oe(...a); };
  console.warn = (...a) => { push("warn", "console", a.map(text).join(" ")); ow(...a); };
  window.addEventListener("pagehide", () => { push("info", "app", "Page closing"); saveSoon(true); });
  let frontSince = document.hidden ? 0 : Date.now(), hiddenAt = document.hidden ? Date.now() : 0;
  document.addEventListener("visibilitychange", () => {
    push("debug", "app", document.hidden ? "App in background" : "App in front");
    if (document.hidden){ hiddenAt = Date.now(); frontSince = 0; saveSoon(true); } else frontSince = Date.now();
  });
  // Android cuts a backgrounded app's network, so failures then (or just after) are expected, not errors
  const background = () => document.hidden || (hiddenAt && Date.now() - hiddenAt < 3000 && !frontSince);

  /* --- hooks into the page, once its scripts have run --- */
  const reqs = {};        // native request id → what was asked (host and path only)
  const where = url => { try { const u = new URL(url); return u.host + u.pathname; } catch(e){ return String(url).split("?")[0].slice(0, 120); } };
  function wrapSync(name, cat){
    const f = window[name]; if (typeof f !== "function" || f.__diag) return;
    const w = function(){ try { return f.apply(this, arguments); } catch(e){ push("error", cat, `${name}() failed: ${e && e.message || e}`, {args: [...arguments].slice(0, 3).map(x => typeof x === "object" ? (x && x.iso ? x.iso : typeof x) : x), stack: String(e && e.stack || "").slice(0, 2500)}); throw e; } };
    w.__diag = true; w.__orig = f;
    try { window[name] = w; } catch(e){}
  }
  function wrapAsync(name, cat){
    const f = window[name]; if (typeof f !== "function" || f.__diag) return;
    const w = function(){
      let r; try { r = f.apply(this, arguments); } catch(e){ push("error", cat, `${name}() failed: ${e && e.message || e}`, {stack: String(e && e.stack || "").slice(0, 2500)}); throw e; }
      if (r && typeof r.then === "function") r.then(null, e => push("error", cat, `${name}() failed: ${e && e.message || e}`, {stack: String(e && e.stack || "").slice(0, 2500)}));
      return r;
    };
    w.__diag = true; w.__orig = f;
    try { window[name] = w; } catch(e){}
  }
  /* The page's own top-level values (declared with let/const in its script, so not on window), read only.
     The page's security rules don't allow eval, so each one is named here. */
  const G = {
    reqId: () => reqId, TT: () => TT, alertState: () => alertState, alertError: () => alertError, rtState: () => rtState,
    sim: () => (typeof SIM !== "undefined" && SIM ? {on: typeof simOn === "function" ? !!simOn() : null, time: SIM.time ? new Date(SIM.base).toISOString() : null, speed: SIM.speed, alert: SIM.alert || null, est: !!SIM.est, crowd: SIM.crowd || null} : null)
  };
  const peek = k => { try { return G[k](); } catch(e){ return undefined; } };

  function hook(){
    // Every answer from the Android side comes through window.__native(id, code, body)
    const nat = window.__native;
    if (typeof nat === "function" && !nat.__diag){
      const w = (id, code, body) => {
        try {
          const r = reqs[id]; delete reqs[id];
          const c = Number(code), what = r ? r.what : "request " + id;
          const ms = r ? Date.now() - r.at : 0;
          if (c === 0) push(background() ? "warn" : "error", r ? r.cat : "network", `${what}: no answer (${background() ? "app in background" : "offline, timed out or blocked"})`, {id, ms});
          else if (c >= 400) push("error", r ? r.cat : "api", `${what}: HTTP ${c}`, {id, ms, body: scrub(String(body || "").slice(0, 300))});
          else if (r && r.cat === "timetable"){ let s = ""; try { const j = JSON.parse(body); s = j.status + (j.error ? ": " + j.error : ""); } catch(e){} push(/error/.test(s) ? "error" : "info", "timetable", `${what}: ${s || "HTTP " + c}`); }
          else if (r && ms > 8000) push("warn", r.cat, `${what}: slow (${Math.round(ms / 1000)} s)`, {id});
        } catch(e){}
        return nat(id, code, body);
      };
      w.__diag = true; window.__native = w;
    }
    const ng = window.nativeGet;
    if (typeof ng === "function" && !ng.__diag){
      const w = function(url, withKey){
        const p = ng.apply(this, arguments);
        try { const id = "r" + peek("reqId"); const lta = /mytransport\.sg/.test(url); reqs[id] = {at: Date.now(), cat: lta ? "api" : "network", what: (lta ? "LTA " : "") + where(url)}; } catch(e){}
        return p;
      };
      w.__diag = true; try { window.nativeGet = w; } catch(e){}
    }
    // Train positions, arrival times, and disruption turn-backs: errors are logged, then thrown on as before
    ["trainsOn", "nextArrivals", "ttTrips", "platOf"].forEach(n => wrapSync(n, "trains"));
    ["lineCuts", "cutTrain", "parseAlerts", "segRunning", "renderOfficial"].forEach(n => wrapSync(n, "disruption"));
    wrapAsync("refreshAll", "api");
    wrapAsync("rtRefresh", "gtfs");
    // App state: offline/online, background, resume
    const ns = window.netState;
    if (typeof ns === "function" && !ns.__diag){ const w = on => { push(on ? "info" : "warn", "state", on ? "Back online" : "Offline"); return ns(on); }; w.__diag = true; window.netState = w; }
    const ar = window.appResume;
    if (typeof ar === "function" && !ar.__diag){ const w = function(){ push("debug", "app", "App resumed"); return ar.apply(this, arguments); }; w.__diag = true; window.appResume = w; }

    // What the app loaded: timetable, version, channel
    const TT = peek("TT");
    if (TT && TT.feed) push("info", "timetable", `LTA timetable loaded (${TT.feed.built || "unknown date"})`, {lines: Object.keys(TT.lines || {}), feed: {built: TT.feed.built, lines: TT.feed.lines}});
    else if (app()) push("error", "timetable", "No LTA timetable in the app: train times are estimates");
    else push("info", "timetable", "Running in a browser: no packed LTA timetable");
    watch();
    setInterval(watch, 5000);
  }

  /* Changes in what the app shows, every 5 seconds: LTA alerts, the GTFS-Realtime feed, test mode. */
  const was = {};
  function changed(k, v){ const s = typeof v === "string" ? v : JSON.stringify(v); if (was[k] === s) return false; const first = !(k in was); was[k] = s; return !first || (v && v !== "null"); }
  function watch(){
    try {
      const err = peek("alertError");
      if (changed("alertError", err || "") && err) push("error", "api", "LTA service alerts: " + err);
      const a = peek("alertState");
      if (a){
        const segs = (a.segments || []).map(s => `${s.line || (s.lines || []).join("/")} ${(s.codes || [])[0] || ""}–${(s.codes || []).slice(-1)[0] || ""}${s.noService ? " no service" : s.running ? " running" : ""}`);
        const v = {status: a.status, segs};
        if (changed("alerts", v)) push(a.status === 2 ? "warn" : "info", "disruption", a.status === 2 ? `LTA disruption: ${segs.join("; ") || "no stretch given"}` : "LTA: trains running normally", {messages: (a.messages || []).slice(0, 4).map(m => String(m.text || "").slice(0, 300))});
      }
      const rt = peek("rtState");
      if (rt){
        const trips = Object.values(rt.trips || {});
        const v = {alerts: (rt.alerts || []).length, cancelled: trips.filter(x => x.x).length, added: trips.filter(x => x.add).length,
          delayed: trips.filter(x => !x.x && Math.abs(x.d || 0) >= 30).length, tripUpdates: trips.length};
        if (changed("rt", v)) push("info", "gtfs", `GTFS-Realtime: ${v.tripUpdates} trip updates, ${v.alerts} alerts, ${v.delayed} delayed/early, ${v.cancelled} cancelled, ${v.added} added`, {at: rt.at, feedAt: rt.feedAt});
        // Only once the app has been open long enough to have refreshed it (the saved copy is old at every start)
        if (rt.at && Date.now() - rt.at > 5 * 60000 && frontSince && Date.now() - frontSince > 2 * 60000 && changed("rtStale", Math.floor((Date.now() - rt.at) / 300000))) push("warn", "gtfs", `GTFS-Realtime data is ${Math.round((Date.now() - rt.at) / 60000)} min old: LTA's live feed hasn't answered since`);
      }
      const sim = peek("sim");
      if (sim && changed("sim", sim) && sim.on) push("info", "state", "Test mode is on: what the app shows is not real", sim);
      const ds = window.mrtDisruptionStats && (() => { try { return window.mrtDisruptionStats(); } catch(e){ return null; } })();
      if (ds && changed("engine", ds.states)) push("info", "disruption", `Disruption engine states today: ${(ds.states || []).join(", ") || "none"}`);
    } catch(e){}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { try { hook(); } catch(e){ push("error", "diagnostics", "Couldn't start the hooks: " + e); } });
  else setTimeout(hook, 0);

  /* --- the log file --- */
  function device(){
    let d = {};
    try { d = JSON.parse(call("diagDevice") || "{}"); } catch(e){}
    try {
      d.userAgent = navigator.userAgent; d.language = navigator.language;
      d.viewport = `${innerWidth}x${innerHeight} @${devicePixelRatio}`;
      d.jsTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (d.online === undefined) d.online = navigator.onLine;
    } catch(e){}
    return d;
  }
  function state(){
    const s = {};
    try { const TT = peek("TT"); s.timetable = TT && TT.feed ? {built: TT.feed.built, lines: Object.keys(TT.lines || {})} : null; } catch(e){}
    try { const a = peek("alertState"); s.ltaAlerts = a ? {status: a.status, at: a.at, segments: (a.segments || []).map(x => ({line: x.line, codes: x.codes, running: x.running, noService: x.noService})), messages: (a.messages || []).map(m => String(m.text || "").slice(0, 500))} : null; s.ltaAlertError = peek("alertError") || ""; } catch(e){}
    try { const rt = peek("rtState"); s.gtfsRealtime = rt ? {at: rt.at, trips: Object.keys(rt.trips || {}).length, alerts: (rt.alerts || []).map(x => ({head: x.head, routes: x.routes, stops: (x.stops || []).slice(0, 20)}))} : null; } catch(e){}
    try { s.testMode = peek("sim"); } catch(e){}
    try { s.disruptionEngine = window.mrtDisruptionStats ? window.mrtDisruptionStats() : null; } catch(e){}
    try { s.screen = location.hash || ""; } catch(e){}
    return s;
  }
  function nativeLog(){
    const out = [];
    try { for (const line of String(call("diagNativeLog") || "").split("\n")) { if (!line.trim()) continue; try { out.push(JSON.parse(line)); } catch(e){} } } catch(e){}
    return out;
  }
  const line = e => `${sgTime(e.ts)} ${("[" + String(e.level).toUpperCase() + "]").padEnd(7)} ${("[" + e.cat + "]").padEnd(13)} ${e.message}${e.repeat ? `  (×${e.repeat}, last ${sgTime(e.last).slice(11, 23)})` : ""}${e.meta !== undefined ? "\n      " + (typeof e.meta === "string" ? e.meta : JSON.stringify(e.meta)) : ""}`;

  /** The full log as text: header (log ID, session, app, phone, what the app had loaded), every entry, then the same as JSON. */
  function build(){
    const now = Date.now(), logId = "L-" + now.toString(36).toUpperCase() + "-" + rnd(3).toUpperCase();
    const dev = device(), st = state(), nat = nativeLog(), all = entries.slice();
    const counts = LEVELS.map(l => `${l} ${all.filter(e => e.level === l).length}`).join(" · ");
    const sessions = [...new Set(all.map(e => e.sid))];
    const h = [
      "MRT Spotter diagnostics log",
      "=======================",
      `Log ID:      ${logId}`,
      `Session ID:  ${SESSION} (started ${sgTime(STARTED)})`,
      `Created:     ${sgTime(now)}`,
      `App:         ${dev.appVersion || call("getVersion") || "?"} (${dev.channel || call("getChannel") || "web"}, ${dev.package || "browser"}, code ${dev.versionCode || "?"})`,
      `Device:      ${[dev.manufacturer, dev.model].filter(Boolean).join(" ") || "browser"} · Android ${dev.android || "?"} (SDK ${dev.sdk || "?"}) · ${dev.webView || ""}`,
      `Network:     ${dev.online === false ? "offline" : "online"}${dev.batterySaver ? " · battery saver on" : ""}${dev.lowMemory ? " · LOW MEMORY" : ""}`,
      `Entries:     ${all.length} in the page log (${counts}), ${nat.length} from Android, ${sessions.length} session(s)`,
      "",
      "Device and app", "--------------", JSON.stringify(dev, null, 2), "",
      "What the app had loaded when the log was made", "----------------------------------------------", JSON.stringify(st, null, 2), "",
      "Log (oldest first, Singapore time)", "----------------------------------"
    ];
    let lastSid = "";
    const body = [];
    for (const e of all){ if (e.sid !== lastSid){ body.push(`--- session ${e.sid}${e.sid === SESSION ? " (this one)" : ""} ---`); lastSid = e.sid; } body.push(line(e)); }
    const nb = nat.length ? ["", "Android side (network, LTA feeds, timetable updates, crashes)", "--------------------------------------------------------------",
      ...nat.map(e => `${String(e.ts || "").replace(/(\d\d)(\d\d)$/, "$1:$2")} ${("[" + String(e.level || "").toUpperCase() + "]").padEnd(7)} ${("[" + (e.cat || "native") + "]").padEnd(13)} ${e.message}`)] : [];
    // GTFS-Realtime captures (rt-capture.js): every response that held at least one entity, raw protobuf included
    let caps = [], ident = [];
    try { caps = window.mrtRtCapture ? window.mrtRtCapture.list() : []; ident = window.mrtRtCapture ? window.mrtRtCapture.identityReport() : []; } catch(e){}
    const cb = ["", `GTFS-Realtime captures (${caps.length}, newest first; raw protobuf as base64 in the JSON copy)`, "-------------------------------------------------------------------",
      ...(caps.length ? caps.map(c => `${sgTime(c.at)} ${c.kind}: ${c.entityCount} entities, ${c.bytes || 0} bytes${c.error ? ", ERROR " + c.error : ""}; fields with values: ${(c.fieldsPresent || []).join(", ") || "none"}${(c.unknownFields || []).length ? `; NOT IN SPEC: ${c.unknownFields.map(u => u.path).join(", ")}` : ""}`)
        : ["None yet: LTA's feeds have held no entity whenever the app checked."]),
      "", "Train identity fields", "---------------------", ...ident.map(r => `${r.field}: ${r.status} (${r.detail})`)];
    const json = JSON.stringify({schema: 2, logId, session: SESSION, createdAt: sgTime(now), device: dev, state: st, entries: all, native: nat, gtfsRealtimeCaptures: caps});
    const name = `mrt-dev-log-${sgTime(now).slice(0, 19).replace(/[-:]/g, "").replace("T", "-")}-${logId.slice(-6)}.txt`;
    return {name, logId, text: [...h, ...body, ...nb, ...cb, "", "Machine-readable copy (JSON)", "----------------------------", json, ""].join("\n")};
  }

  /** "Share log file": the whole log (not just what's on screen) as a .txt file through Android's share sheet. */
  async function shareFile(){
    const f = build();
    push("info", "diagnostics", `Log file shared: ${f.logId} (${Math.round(f.text.length / 1024)} KB, ${entries.length} entries)`);
    const A = app();
    if (A && typeof A.shareLogFile === "function"){ let ok = false; try { ok = A.shareLogFile(f.name, f.text); } catch(e){} if (ok) return "shared"; }
    try {
      const file = new File([f.text], f.name, {type: "text/plain"});
      if (navigator.canShare && navigator.canShare({files: [file]})){ await navigator.share({files: [file], title: f.name}); return "shared"; }
    } catch(e){ if (e && e.name === "AbortError") return "cancelled"; }
    try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([f.text], {type: "text/plain"})); a.download = f.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); return "downloaded"; } catch(e){}
    if (A && typeof A.share === "function"){ try { A.share(f.text.slice(0, 199000)); return "shared as text"; } catch(e){} }
    return "failed";
  }
  function clear(){
    entries = []; dirty = true; save();
    call("diagClear");
    push("info", "diagnostics", "Log cleared", {session: SESSION});
  }

  /* --- Dev tools → Diagnostics viewer --- */
  let view = null, filter = "all", query = "", paint = 0;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
  const CSS = `.diag-bg{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.45)}
.diag{position:fixed;inset:0;z-index:91;background:var(--panel,#fff);color:var(--fg,#111);display:flex;flex-direction:column;border-top:6px solid #c2410c;padding:12px 14px calc(12px + env(safe-area-inset-bottom,0px));gap:10px;outline:none}
.diag-h{display:flex;align-items:center;justify-content:space-between;gap:8px}.diag-h h2{margin:0;font:700 22px/1.1 var(--display,inherit)}
.diag-h button{width:40px;height:40px;border-radius:20px;border:0;background:var(--soft,#eee);color:inherit;font-size:20px;cursor:pointer}
.diag-meta{font:500 11px/1.5 var(--mono,monospace);color:var(--muted,#666);word-break:break-all}
.diag-act{display:flex;flex-wrap:wrap;gap:6px}.diag-f{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.diag-f button{border:1px solid var(--rule,#ccc);background:var(--panel,#fff);color:inherit;border-radius:14px;padding:4px 10px;font:600 12px var(--body,inherit);cursor:pointer}
.diag-f button[aria-pressed=true]{background:var(--fg,#111);color:var(--panel,#fff)}
.diag-f input{flex:1;min-width:120px;border:1px solid var(--rule,#ccc);background:var(--bg,#fff);color:inherit;border-radius:8px;padding:6px 8px;font:13px var(--body,inherit)}
.diag-list{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;background:#101419;color:#d9e1e8;border-radius:10px;padding:8px;font:500 11px/1.45 var(--mono,monospace)}
@media (min-width:768px){.diag{inset:20px auto;left:50%;transform:translateX(-50%);width:min(860px,calc(100vw - 40px));border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.45)}}
.diag-row{padding:3px 0;border-bottom:1px solid #1f2730;white-space:pre-wrap;word-break:break-word}.diag-row i{font-style:normal;color:#7d8a96}
.diag-row b{font-weight:700}.diag-row.l-error b,.diag-row.l-crash b{color:#ff8a80}.diag-row.l-warn b{color:#ffd180}.diag-row.l-info b{color:#80d8ff}.diag-row.l-debug b{color:#9e9e9e}
.diag-row.l-crash{background:#3b1515}.diag-row small{display:block;color:#93a1ad;padding-left:10px}.diag-note{font-size:12px;color:var(--muted,#666)}`;
  function open(){
    if (!view){
      const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
      const bg = document.createElement("div"); bg.className = "diag-bg"; bg.hidden = true;
      const el = document.createElement("div"); el.className = "diag"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Diagnostics"); el.tabIndex = -1; el.hidden = true;
      el.innerHTML = `<div class="diag-h"><h2>Diagnostics</h2><button type="button" data-d="close" aria-label="Close">×</button></div>
        <div class="diag-meta" id="diagMeta"></div>
        <div class="diag-act"><button type="button" class="btn" data-d="share">📤 Share log file</button><button type="button" class="btn ghost" data-d="clear">🗑️ Clear logs</button></div>
        <div class="diag-f">${[["all", "All"], ["error", "Errors"], ["warn", "Warnings"], ["info", "Info"], ["debug", "Debug"]].map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${k === filter}">${l}</button>`).join("")}<input type="search" id="diagQ" placeholder="Search the log" aria-label="Search the log"></div>
        <div class="diag-note" id="diagNote"></div>
        <div class="diag-list" id="diagList" aria-live="off"></div>`;
      document.body.append(bg, el);
      bg.onclick = () => close();
      el.addEventListener("click", async ev => {
        const b = ev.target.closest("button"); if (!b) return;
        if (b.dataset.d === "close") close();
        else if (b.dataset.d === "share"){ b.disabled = true; const r = await shareFile(); b.disabled = false; note(r === "failed" ? "Couldn't share the log file." : r === "downloaded" ? "Log file downloaded." : r === "cancelled" ? "" : "Log file ready in the share sheet: it has the whole log, not just what's shown here."); }
        else if (b.dataset.d === "clear"){ if (confirm("Clear the diagnostics log? This can't be undone.")){ clear(); note("Log cleared."); } }
        else if (b.dataset.f){ filter = b.dataset.f; el.querySelectorAll("[data-f]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.f === filter))); render(); }
      });
      el.querySelector("#diagQ").addEventListener("input", e => { query = e.target.value.trim().toLowerCase(); render(); });
      view = {bg, el};
      listeners.add(() => { if (view && !view.el.hidden && !paint) paint = setTimeout(() => { paint = 0; render(); }, 400); });   // live
    }
    view.bg.hidden = view.el.hidden = false;
    if (typeof window.mrtSyncSheetLock === "function") window.mrtSyncSheetLock();
    else document.body.classList.add("sheet-open");
    note(""); render(); view.el.focus();
    push("debug", "diagnostics", "Diagnostics opened");
  }
  function close(){ if (!view || view.el.hidden) return false; view.bg.hidden = view.el.hidden = true; if (typeof window.mrtSyncSheetLock === "function") window.mrtSyncSheetLock(); else document.body.classList.remove("sheet-open"); return true; }
  function note(s){ const n = view && view.el.querySelector("#diagNote"); if (n) n.textContent = s; }
  function render(){
    if (!view || view.el.hidden) return;
    const want = {all: null, error: ["error", "crash"], warn: ["warn"], info: ["info"], debug: ["debug"]}[filter];
    const rows = entries.filter(e => (!want || want.includes(e.level))
      && (!query || (e.message + " " + e.cat + " " + (e.meta ? JSON.stringify(e.meta) : "")).toLowerCase().includes(query)));
    const shown = rows.slice(-400).reverse();
    const errs = entries.filter(e => e.level === "error" || e.level === "crash").length, warns = entries.filter(e => e.level === "warn").length;
    view.el.querySelector("#diagMeta").innerHTML = `Session ${esc(SESSION)} · ${esc(call("getVersion") || "web")} (${esc(call("getChannel") || "web")})<br>${entries.length} entries · ${errs} error${errs === 1 ? "" : "s"} · ${warns} warning${warns === 1 ? "" : "s"}${rows.length > shown.length ? ` · showing the newest ${shown.length} of ${rows.length}` : ""}`;
    const list = view.el.querySelector("#diagList"), top = list.scrollTop < 20;
    list.innerHTML = shown.length ? shown.map(e => `<div class="diag-row l-${esc(e.level)}"><i>${esc(sgTime(e.ts).slice(11, 23))}</i> <b>${esc(e.level.toUpperCase())}</b> <i>${esc(e.cat)}</i> ${esc(e.message)}${e.repeat ? ` <i>×${e.repeat}</i>` : ""}${e.sid !== SESSION ? ` <i>(${esc(e.sid)})</i>` : ""}${e.meta !== undefined ? `<small>${esc(typeof e.meta === "string" ? e.meta : JSON.stringify(e.meta)).slice(0, 1500)}</small>` : ""}</div>`).join("") : `<div class="diag-row"><i>No entries${filter !== "all" || query ? " match" : " yet"}.</i></div>`;
    if (top) list.scrollTop = 0;
  }
  // Android's back button closes the viewer first
  document.addEventListener("DOMContentLoaded", () => {
    const prev = window.appBack;
    window.appBack = () => close() || (typeof prev === "function" ? prev() : false);
  });

  const api = {
    session: SESSION,
    push, log: push,
    list: () => entries.slice(), recent: n => entries.slice(-(Number(n) || 30)), count: () => entries.length,
    clear, build, shareFile, open, close, onEntry: f => { listeners.add(f); return () => listeners.delete(f); },
    // the shape the Test mode sheet's "AI diagnostic bundle" used
    bundle: () => ({schema: 2, createdAt: sgTime(Date.now()), app: "mrt-dev", session: SESSION, version: call("getVersion") || "", channel: call("getChannel") || "web", url: location.href, entries: entries.slice()})
  };
  window.__mrtDiag = api;
  window.mrtDiagnostics = api;
})();

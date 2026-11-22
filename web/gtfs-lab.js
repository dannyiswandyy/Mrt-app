/* MRT Dev: GTFS analysis (Dev tools) and "This train's day" on train details.
 * Uses run-graph.js on the timetable the page already loaded (TT, LINES). Developer-only for now.
 * Every inferred line shows its label (CONFIRMED BY DATA / STRONG INFERENCE / POSSIBLE / NOT SUPPORTED)
 * and the evidence behind it. A run is a scheduled duty, never a confirmed physical trainset.
 */
(function () {
  "use strict";
  const RG = window.mrtRunGraph; if (!RG) return;
  const L = RG.LABELS;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
  const diag = (lv, msg, meta) => { try { window.__mrtDiag && window.__mrtDiag.push(lv, "gtfs", msg, meta); } catch (e) {} };
  const tt = () => { try { return TT; } catch (e) { return null; } };                    // the page's own `let TT`
  const stationsOf = c => { try { return LINES[c] ? LINES[c].stations : null; } catch (e) { return null; } };
  const store = {get: (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }};

  /* ---------- graph cache (built per line, only when needed) ---------- */
  let cacheFor = null, lines = {};
  function lineGraph(code) {
    const T = tt(); if (!T || !T.lines || !T.lines[code]) return null;
    if (cacheFor !== T) { cacheFor = T; lines = {}; }
    if (!lines[code]) { const t0 = Date.now(); lines[code] = RG.buildLine(T, code, stationsOf); lines[code].ms = Date.now() - t0; }
    return lines[code];
  }
  const graph = () => { const T = tt(); return T ? {lines: Object.fromEntries(Object.keys(T.lines).map(c => [c, lineGraph(c)])), feed: T.feed && T.feed.built} : null; };
  const badge = label => `<span class="rg-lb rg-${label === L.CONFIRMED ? "c" : label === L.STRONG ? "s" : label === L.POSSIBLE ? "p" : "n"}">${esc(label)}</span>`;
  const evHTML = (i, open) => `<div class="rg-ev">${badge(i.label)} ${esc(i.inference)}${i.evidence && i.evidence.length ? `<details${open ? " open" : ""}><summary>Evidence</summary>${i.evidence.map(x => `<div class="rg-evl">${esc(x)}</div>`).join("")}</details>` : ""}</div>`;

  const CSS = `.rg-lb{display:inline-block;font:700 9.5px/1.4 var(--mono,monospace);letter-spacing:.03em;padding:1px 5px;border-radius:4px;white-space:nowrap}
.rg-c{background:var(--goodbg,#e6f4ea);color:var(--good,#11823b)}.rg-s{background:rgba(37,99,235,.12);color:#2563eb}.rg-p{background:rgba(161,92,0,.13);color:var(--warn,#a15c00)}.rg-n{background:var(--soft,#eee);color:var(--muted,#666)}
.rg-ev{font-size:12px;line-height:1.45;margin:3px 0}.rg-ev details{margin:2px 0 0 4px}.rg-ev summary{cursor:pointer;color:var(--muted,#666);font-size:11px}.rg-evl{font:500 11px/1.45 var(--mono,monospace);color:var(--muted,#666);padding-left:8px;border-left:2px solid var(--rule,#ddd);margin:2px 0;word-break:break-word}
.rg-day{border:1px solid var(--rule,#ddd);border-radius:10px;padding:8px 10px;margin:6px 0}.rg-day>summary{cursor:pointer;font-weight:700;font-size:13px}.rg-day .rg-note{font-size:11.5px;color:var(--muted,#666);margin:4px 0 6px}
.rg-tl{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:2px}.rg-tl li{display:grid;grid-template-columns:44px 1fr;gap:6px;font-size:12.5px;padding:3px 4px;border-radius:6px}
.rg-tl li .t{font:600 12px var(--mono,monospace);color:var(--muted,#666)}.rg-tl li.cur{background:rgba(37,99,235,.12);font-weight:700}.rg-tl li.adj{background:var(--soft,#f2f2f2)}.rg-tl li.gap{grid-template-columns:44px 1fr;color:var(--muted,#666);font-size:11.5px}
.rg-tl li.miss{background:rgba(161,92,0,.10)}.rg-tag{font:700 9px var(--mono,monospace);color:var(--muted,#666);margin-left:4px}
.rg-lab{position:fixed;inset:0;z-index:92;background:var(--panel,#fff);color:var(--fg,#111);display:flex;flex-direction:column;border-top:6px solid #c2410c;padding:12px 14px calc(12px + env(safe-area-inset-bottom,0px));gap:8px;outline:none}
.rg-lab-h{display:flex;align-items:center;justify-content:space-between;gap:8px}.rg-lab-h h2{margin:0;font:700 20px/1.1 var(--display,inherit)}.rg-lab-h button{width:40px;height:40px;border-radius:20px;border:0;background:var(--soft,#eee);color:inherit;font-size:20px}
.rg-ctl{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.rg-ctl select,.rg-ctl input{border:1px solid var(--rule,#ccc);background:var(--bg,#fff);color:inherit;border-radius:8px;padding:5px 7px;font:13px var(--body,inherit)}
.rg-tabs{display:flex;gap:4px;flex-wrap:wrap}.rg-tabs button{border:1px solid var(--rule,#ccc);background:var(--panel,#fff);color:inherit;border-radius:14px;padding:4px 10px;font:600 12px var(--body,inherit)}.rg-tabs button[aria-pressed=true]{background:var(--fg,#111);color:var(--panel,#fff)}
.rg-body{flex:1;overflow:auto;overscroll-behavior:contain;font-size:13px}.rg-run{border-bottom:1px solid var(--rule,#e5e5e5);padding:6px 2px}.rg-run>summary{cursor:pointer;display:grid;grid-template-columns:70px 1fr;gap:6px;align-items:baseline}
.rg-run>summary b{font:700 13px var(--mono,monospace)}.rg-kv{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:12px;margin:6px 0}.rg-kv dt{color:var(--muted,#666)}.rg-kv dd{margin:0}
.rg-tbl{border-collapse:collapse;font-size:12px;width:100%}.rg-tbl td,.rg-tbl th{border-bottom:1px solid var(--rule,#e5e5e5);padding:3px 5px;text-align:left;vertical-align:top}.rg-tbl th{color:var(--muted,#666);font-weight:600}
.rg-muted{color:var(--muted,#666);font-size:12px}`;
  let cssDone = false;
  const css = () => { if (cssDone) return; cssDone = true; const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); };

  /* ---------- "Today's journey" on train details ----------
   * Plain-language view of the run this trip belongs to: the trips in order, where it turns round, and
   * where it finishes. Each inference keeps its label and evidence, tucked under "How we know". */
  const DAY_CSS = `.td{border:1px solid var(--rule,#ddd);border-radius:12px;padding:0;margin:6px 0;overflow:hidden}
.td>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px;padding:10px 12px}.td>summary::-webkit-details-marker{display:none}
.td>summary b{font-size:14px}.td>summary small{color:var(--muted,#666);font-size:12px;margin-left:auto;text-align:right}.td>summary i{font-style:normal;color:var(--muted,#666);transition:transform .15s}.td[open]>summary i{transform:rotate(180deg)}
.td-list{list-style:none;margin:0;padding:2px 12px 8px;display:grid}
.td-trip{display:grid;grid-template-columns:48px 1fr auto;gap:8px;align-items:baseline;padding:7px 0;font-size:13.5px}
.td-trip .t{font:600 12.5px var(--mono,monospace);color:var(--muted,#666)}.td-trip .a{font-size:11.5px;color:var(--muted,#666)}
.td-trip.past{opacity:.5}.td-trip.cur{background:var(--soft,#f2f2f2);border-radius:8px;margin:0 -6px;padding:7px 6px;grid-template-columns:48px 1fr auto}
.td-now{font:700 10px var(--body,inherit);letter-spacing:.05em;text-transform:uppercase;background:var(--c,#2563eb);color:#fff;border-radius:5px;padding:2px 6px;margin-left:6px;vertical-align:1px}
.td-gap{padding:0 0 0 56px;font-size:11.5px;color:var(--muted,#666)}.td-gap.past{opacity:.5}
.td-end{padding:6px 0 0 56px;font-size:12px;color:var(--muted,#666)}
.td-foot{border-top:1px solid var(--rule,#e5e5e5);padding:8px 12px 10px;font-size:11.5px;color:var(--muted,#666)}
.td-foot details summary{cursor:pointer;margin-top:4px}.td-foot details[open] summary{margin-bottom:4px}`;
  let dayCssDone = false;
  const dayCss = () => { if (dayCssDone) return; dayCssDone = true; const s = document.createElement("style"); s.textContent = DAY_CSS; document.head.appendChild(s); };
  const mins = sec => { const m = Math.round(sec / 60); return m < 1 ? "under a minute" : m + " min"; };

  function runDayHTML(code, tid, nowSec) {
    try {
      css(); dayCss();
      const g = lineGraph(code); if (!g) return "";
      const t = g.trips.find(x => x.tid === tid); if (!t || !t.run) return "";
      const r = t.run, i = t.index, rows = [], proof = [r.clsItem];
      const finalScheduledTrip = i === r.trips.length - 1;
      r.trips.forEach((x, k) => {
        if (k) {
          const lk = r.links[k - 1], it = lk.items[0], past = k <= i ? " past" : "";
          proof.push(...lk.items);
          const text = lk.type === "turnaround" ? `↺ Turns round at ${esc(lk.station)} · ${mins(lk.gap)}`
            : lk.type === "continues" ? `Carries on from ${esc(lk.station)} after ${mins(lk.gap)}`
            : lk.type === "missing" ? (lk.gap > 0 ? `${it.label === L.STRONG ? "Likely moves" : "May move"} from ${esc(lk.from.dest)} to ${esc(lk.to.origin)} without passengers`
              : `Timetable gap: the next trip starts at ${esc(lk.to.origin)} before this one gets in`)
            : `Leaves ${esc(lk.station)} straight away`;
          rows.push(`<li class="td-gap${past}">${text}</li>`);
        }
        const cls = k < i ? " past" : k === i ? " cur" : "";
        rows.push(`<li class="td-trip${cls}"><span class="t">${esc(RG.clock(x.dep))}</span><span>${esc(x.origin)} → ${esc(x.dest)}${k === i ? `<span class="td-now">This trip</span>` : ""}</span><span class="a">arr ${esc(RG.clock(x.arr))}</span></li>`);
      });
      proof.push(r.leaves, ...(r.notes || []));
      rows.push(`<li class="td-end">Finishes at ${esc(r.last.dest)} · ${esc(RG.clock(r.last.arr))}${finalScheduledTrip ? " · Last scheduled trip in this run" : ""}</li>`);
      const n = r.trips.length;
      return `<details class="td"><summary><b>Today's journey</b><small>${esc(r.clsItem.inference)} · ${n} trip${n === 1 ? "" : "s"}</small><i>⌄</i></summary>
        <ol class="td-list">${rows.join("")}</ol>
        <div class="td-foot"><p><b>Roster duty ≠ live operating status.</b> FD = Full Day; LN = Late Night; (AM) = Morning Peak; (PM) = Afternoon Peak; HD = Half Day. ${finalScheduledTrip ? "This is the final listed passenger trip in the scheduled run; a depot withdrawal is not confirmed." : "A train can finish its current trip while its rostered duty continues."}</p>From LTA's timetable for this train's duty (run ${esc(r.run)}). LTA doesn't say which physical train runs it.
          <details><summary>How we know</summary>${proof.filter(Boolean).map(x => evHTML(x)).join("")}</details></div></details>`;
    } catch (e) { diag("warn", "Today's journey failed: " + (e && e.message || e)); return ""; }
  }

  /* ---------- feed changes: compare with the last timetable this phone saw ---------- */
  function checkFeed() {
    const T = tt(); if (!T || !T.lines) return;
    const sig = `${T.feed && T.feed.built}|${(T.services || []).length}|${Object.values(T.lines).reduce((n, l) => n + (l.trips || []).length, 0)}|${JSON.stringify(T.except || {}).length}`;
    const last = store.get("mrt.gtfs.feedSig", null);
    if (last === sig) return;
    const t0 = Date.now(), G = graph(), sum = RG.feedSummary(T, G), prev = store.get("mrt.gtfs.summary", null);
    if (prev) {
      const changes = RG.diffFeeds(prev, sum);
      const rec = {at: Date.now(), from: prev.built, to: sum.built, changes};
      store.set("mrt.gtfs.diffs", [rec].concat(store.get("mrt.gtfs.diffs", [])).slice(0, 10));
      diag(changes.length ? "info" : "debug", `LTA timetable changed (${prev.built} → ${sum.built}): ${changes.length} change(s)`, changes.slice(0, 40));
    } else diag("info", `LTA timetable ${sum.built}: saved as the baseline for future comparisons`);
    for (const s of RG.specialServices(T, G)) diag("info", `Dated service: ${s.item.inference}`, {dates: s.dates, lines: s.lines, diff: s.diff});
    store.set("mrt.gtfs.summary", sum); store.set("mrt.gtfs.feedSig", sig);
    diag("debug", `GTFS analysis built in ${Date.now() - t0} ms`);
  }

  /* ---------- Dev tools → GTFS analysis ---------- */
  let V = null, tab = "runs", sel = {line: "NSL", svc: "", q: "", cls: ""};
  function open(opts) {
    css();
    if (opts) Object.assign(sel, opts);
    if (!V) {
      V = document.createElement("div"); V.className = "rg-lab"; V.setAttribute("role", "dialog"); V.setAttribute("aria-label", "GTFS analysis"); V.tabIndex = -1;
      document.body.appendChild(V);
      V.addEventListener("click", e => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.x === "close") close();
        else if (b.dataset.tab) { tab = b.dataset.tab; paint(); }
      });
      V.addEventListener("change", e => { const t = e.target; if (t.id === "rgLine") { sel.line = t.value; sel.svc = ""; } if (t.id === "rgSvc") sel.svc = t.value; if (t.id === "rgCls") sel.cls = t.value; paint(); });
      V.addEventListener("input", e => { if (e.target.id === "rgQ") { sel.q = e.target.value.trim(); clearTimeout(V.qt); V.qt = setTimeout(paintBody, 250); } });
    }
    V.hidden = false; document.body.classList.add("sheet-open"); paint(); V.focus();
  }
  function close() { if (!V || V.hidden) return false; V.hidden = true; document.body.classList.remove("sheet-open"); return true; }
  function paint() {
    const T = tt();
    if (!T || !T.lines) { V.innerHTML = `<div class="rg-lab-h"><h2>GTFS analysis</h2><button type="button" data-x="close" aria-label="Close">×</button></div><p>No LTA timetable in the app.</p>`; return; }
    const g = lineGraph(sel.line) || lineGraph(Object.keys(T.lines)[0]); sel.line = g.code;
    const svcs = [...new Set(g.trips.map(t => t.service))];
    if (!sel.svc || !svcs.includes(sel.svc)) sel.svc = svcs.find(s => /_WD/.test(s) && !/SPECIAL/.test(s)) || svcs[0];
    const tabs = [["runs", "Runs"], ["stations", "Stations"], ["counter", "Trip numbers"], ["calendar", "Calendar"], ["changes", "Feed changes"], ["rt", "Realtime"], ["identity", "Train identity"], ["odd", "Anomalies"]];
    V.innerHTML = `<div class="rg-lab-h"><h2>GTFS analysis</h2><button type="button" data-x="close" aria-label="Close">×</button></div>
      <div class="rg-muted">LTA GTFS ${esc(T.feed && T.feed.built)} · line built in ${g.ms} ms · runs are scheduled duties, not trainsets</div>
      <div class="rg-ctl"><select id="rgLine" aria-label="Line">${Object.keys(T.lines).map(c => `<option${c === sel.line ? " selected" : ""}>${c}</option>`).join("")}</select>
      <select id="rgSvc" aria-label="Service">${svcs.map(s => `<option${s === sel.svc ? " selected" : ""}>${esc(s)}</option>`).join("")}</select>
      <select id="rgCls" aria-label="Class"><option value="">All classes</option>${["ALL DAY", "MORNING PEAK", "EVENING PEAK", "SHORT WORKING", "OTHER"].map(c => `<option${c === sel.cls ? " selected" : ""}>${c}</option>`).join("")}</select>
      <input id="rgQ" type="search" placeholder="Run or station" value="${esc(sel.q)}" aria-label="Find a run or station"></div>
      <div class="rg-tabs">${tabs.map(([k, l]) => `<button type="button" data-tab="${k}" aria-pressed="${k === tab}">${l}</button>`).join("")}</div>
      <div class="rg-body" id="rgBody"></div>`;
    paintBody();
  }
  function paintBody() {
    const body = V && V.querySelector("#rgBody"); if (!body) return;
    const g = lineGraph(sel.line), T = tt();
    try { body.innerHTML = ({runs, stations, counter, calendar, changes, rt, identity, odd})[tab](g, T); }
    catch (e) { body.innerHTML = `<p>Couldn't show this: ${esc(e && e.message || e)}</p>`; diag("error", "GTFS analysis view failed: " + (e && e.message || e)); }
  }
  function runs(g) {
    if (!g.runs.length) return g.note ? evHTML(g.note, true) : "<p>No runs on this line.</p>";
    const q = sel.q.toLowerCase();
    const list = g.runs.filter(r => r.service === sel.svc && (!sel.cls || r.cls === sel.cls) &&
      (!q || r.run.replace(/^0+/, "") === q.replace(/^0+/, "") || r.trips.some(t => t.origin.toLowerCase().includes(q) || t.dest.toLowerCase().includes(q))));
    return `<p class="rg-muted">${list.length} run(s). Tap one for every trip and the evidence.</p>` + list.map(r => {
      const s = r.summary;
      return `<details class="rg-run"><summary><b>${esc(r.run)}</b><span>${esc(RG.clock(r.start))}–${esc(RG.clock(r.end))} · ${r.trips.length} trips · ${esc(r.cls)} · ${badge(s.confidence)}</span></summary>
        <dl class="rg-kv"><dt>Line</dt><dd>${esc(r.line)}</dd><dt>Run</dt><dd>${esc(r.run)}</dd><dt>Day</dt><dd>${esc(r.service)}</dd><dt>Trips</dt><dd>${r.trips.length}</dd>
        <dt>Start</dt><dd>${esc(r.first.origin)} ${esc(RG.hms(r.start))}${r.partway.starts ? " · partway along the line" : ""}</dd>
        <dt>End</dt><dd>${esc(r.last.dest)} ${esc(RG.hms(r.end))}${r.partway.ends ? " · partway along the line" : ""}</dd>
        <dt>Classification</dt><dd>${esc(r.cls)}</dd><dt>Turnbacks</dt><dd>${s.turnarounds}${s.continues ? ` (+${s.continues} straight on)` : ""}</dd>
        <dt>Missing movements</dt><dd>${s.missing}</dd><dt>Trip-number jumps</dt><dd>${s.jumps}</dd><dt>Confidence</dt><dd>${badge(s.confidence)}</dd></dl>
        ${evHTML(r.enters)}${evHTML(r.clsItem)}
        <table class="rg-tbl"><tr><th>Departs</th><th>Trip</th><th>From → to</th><th>Arrives</th></tr>${r.trips.map((t, k) => {
          const lk = k ? r.links[k - 1] : null;
          return (lk ? `<tr><td></td><td colspan="3">${lk.items.map(i => evHTML(i)).join("")}</td></tr>` : "") +
            `<tr><td>${esc(RG.hms(t.dep))}</td><td>${esc(t.tid)}${t.block ? `<br><span class="rg-muted">block ${esc(t.block)}</span>` : ""}</td><td>${esc(t.origin)}${t.originSide ? ` (${esc(t.originSide)})` : ""} → ${esc(t.dest)}${t.destSide ? ` (${esc(t.destSide)})` : ""} · ${t.stops} stops</td><td>${esc(RG.hms(t.arr))}</td></tr>` +
            (t.anomalies.length ? `<tr><td></td><td colspan="3">${t.anomalies.map(a => evHTML(a)).join("")}</td></tr>` : "");
        }).join("")}</table>${evHTML(r.leaves)}${(r.notes || []).map(i => evHTML(i)).join("")}</details>`;
    }).join("");
  }
  function stations(g) {
    const s = g.stations || {}, st = (s.starts || {})[sel.svc] || {}, en = (s.ends || {})[sel.svc] || {}, term = (g.termini[sel.svc] || {});
    const names = [...new Set(Object.keys(st).concat(Object.keys(en)))].sort((a, b) => ((st[b] || 0) + (en[b] || 0)) - ((st[a] || 0) + (en[a] || 0)));
    return `${evHTML({label: L.CONFIRMED, inference: `Main termini: ${(term.stations || []).join(", ") || "none"}`, evidence: [term.evidence || ""]})}
      <p class="rg-muted">Where runs enter and leave published service (${esc(sel.svc)}). Counts are from the timetable; depot names are deliberately not given, because GTFS doesn't prove them.</p>
      <table class="rg-tbl"><tr><th>Station</th><th>Runs start</th><th>Runs end</th><th></th></tr>${names.map(n => `<tr><td>${esc(n)}</td><td>${st[n] || 0}</td><td>${en[n] || 0}</td><td>${(term.stations || []).includes(n) ? "terminus" : "partway"}${(en[n] || 0) > 0 && !(st[n] || 0) ? " · trains leave here, none start" : ""}</td></tr>`).join("")}</table>`;
  }
  function counter(g) {
    const rows = Object.values(g.jumpProfiles || {}).sort((a, b) => b.n - a.n);
    const pairs = (g.pairings || []).map(p => `<div class="rg-run">${evHTML(p.item, true)}${p.exceptions.map(i => evHTML(i)).join("")}${p.starts.map(i => evHTML(i)).join("")}${p.missing.length ? `<div class="rg-muted">${p.missing.length} run(s) end here with no paired number: ${badge(L.POSSIBLE)} POSSIBLE WITHDRAWAL / MISSING PAIRED WORKING</div>` : ""}</div>`).join("");
    return evHTML(g.counter.item, true) + (g.counterRule ? evHTML(g.counterRule.item, true) : "") + pairs + (rows.length ? `<table class="rg-tbl"><tr><th>Station</th><th>Sides</th><th>What</th><th>Count</th><th>Counter steps</th><th>Reading</th></tr>${rows.map(p =>
      `<tr><td>${esc(p.station)}</td><td>${esc(p.sides)}</td><td>${esc(p.type)}</td><td>${p.n}</td><td>${esc(Object.entries(p.hist).map(([k, v]) => `+${k}: ${v}`).join(", "))}</td><td>${badge(p.label)} ${esc(p.inference)}${p.reading ? `<br>${badge(p.reading.label)} ${esc(p.reading.inference)}` : ""}</td></tr>`).join("")}</table>` : "");
  }
  function calendar(g, T) {
    const sp = RG.specialServices(T, graph());
    const today = (() => { try { return sgNow().iso; } catch (e) { return new Date(Date.now() + 288e5).toISOString().slice(0, 10); } })();
    return `<p class="rg-muted">Today (${esc(today)}) runs: ${esc(RG.activeServices(T, today).join(", "))}. PH in LTA's IDs is the Sunday timetable; LTA's calendar adds no public holidays.</p>` +
      (sp.length ? sp.map(s => `<div class="rg-run">${evHTML(s.item, true)}<div class="rg-muted">Dates: ${esc(s.dates.join(", "))} · lines ${esc(s.lines.join(", "))}</div>${Object.entries(s.diff).map(([c, d]) =>
        `<div class="rg-muted">${esc(c)}: ${d.tripsBase} → ${d.tripsSpecial} trips, ${d.runsBase} → ${d.runsSpecial} runs; differs from ${esc(d.differsFrom || "—")}. Only in ${esc(d.base)}: ${esc(Object.entries(d.patternsOnlyBase).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ×${v}`).join("; "))}. Only in ${esc(d.special)}: ${esc(Object.entries(d.patternsOnlySpecial).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ×${v}`).join("; "))}</div>`).join("")}</div>`).join("") : "<p>No dated services in this timetable.</p>");
  }
  function changes() {
    const d = store.get("mrt.gtfs.diffs", []);
    return d.length ? d.map(x => `<div class="rg-run"><b>${esc(x.from)} → ${esc(x.to)}</b> <span class="rg-muted">${esc(new Date(x.at).toISOString().slice(0, 16))}</span><ul>${x.changes.slice(0, 60).map(c => `<li>${esc(c.text)}${c.detail ? ` <span class="rg-muted">${esc(c.detail)}</span>` : ""}</li>`).join("") || "<li>No differences</li>"}</ul></div>`).join("")
      : "<p>No timetable change seen yet on this phone. The first timetable is kept as the baseline; the next one LTA publishes is compared with it.</p>";
  }
  function rt() {
    const C = window.mrtRtCapture, list = C ? C.list() : [];
    if (!list.length) return "<p>No GTFS-Realtime capture yet. One is saved whenever LTA's trip-update or alert feed holds at least one entity (latest 20 kept).</p>";
    return list.map(c => `<details class="rg-run"><summary><b>${esc(c.kind)}</b><span>${esc(new Date(c.at).toISOString().slice(0, 19))} · ${c.entityCount} entities · ${c.bytes || 0} bytes${c.unknownFields && c.unknownFields.length ? ` · ${c.unknownFields.length} non-spec field(s)` : ""}</span></summary>
      <div class="rg-muted">Fields with values: ${esc((c.fieldsPresent || []).join(", "))}</div>
      ${c.unknownFields && c.unknownFields.length ? `<div class="rg-muted">Not in the GTFS-RT spec: ${esc(c.unknownFields.map(u => `${u.path} (wire ${u.wire}) ${u.sample || ""}`).join("; "))}</div>` : ""}
      <table class="rg-tbl"><tr><th>trip_id</th><th>route</th><th>rel.</th><th>vehicle</th><th>delay</th><th>stops</th></tr>${(c.entities || []).slice(0, 40).map(e =>
        `<tr><td>${esc(e.trip_id || e.type)}</td><td>${esc(e.route_id || "")}</td><td>${esc(e.schedule_relationship || "")}</td><td>${esc(e.vehicle ? [e.vehicle.id, e.vehicle.label].filter(Boolean).join(" / ") : "")}</td><td>${esc(e.delay != null ? e.delay : "")}</td><td>${esc(e.stop_time_update_count != null ? e.stop_time_update_count : e.alert ? (e.alert.header || "").slice(0, 80) : "")}</td></tr>`).join("")}</table></details>`).join("");
  }
  function identity(g) {
    const C = window.mrtRtCapture, rows = C ? C.identityReport() : [];
    return `<p class="rg-muted">Anything that could name a physical train. A run number is a duty, not a trainset; the app never maps runs to trains.</p>
      <table class="rg-tbl"><tr><th>Field</th><th>Status</th><th>Detail</th></tr>${rows.map(r => `<tr><td>${esc(r.field)}</td><td><b>${esc(r.status)}</b></td><td>${esc(r.detail)}</td></tr>`).join("")}</table>
      <h3 style="font-size:13px;margin:12px 0 4px">block_id on ${esc(g.code)}</h3>${g.blockInfo.items ? g.blockInfo.items.map(i => evHTML(i, true)).join("") : evHTML(g.blockInfo, true)}`;
  }
  function odd(g) {
    const items = g.anomalies.concat(g.runs.flatMap(r => r.links.filter(k => k.type === "missing" || k.type === "overlap").map(k => Object.assign({tid: `${k.from.tid} → ${k.to.tid}`}, k.items[0]))));
    return items.length ? items.map(a => `<div class="rg-run"><div class="rg-muted">${esc(a.tid)}</div>${evHTML(a, true)}</div>`).join("") : "<p>Nothing unusual found on this line.</p>";
  }

  /* ---------- wiring ---------- */
  window.mrtRunDayHTML = runDayHTML;
  window.mrtGtfsLab = {open, close, lineGraph, graph, checkFeed};
  document.addEventListener("DOMContentLoaded", () => {
    const prev = window.appBack;
    window.appBack = () => close() || (typeof prev === "function" ? prev() : false);
    // the comparison builds every line once: after start-up, off the busy first seconds
    // one line at a time when the phone is idle, so building them never freezes a tap (it took ~0.7 s in one go)
    setTimeout(() => {
      let codes = []; try { const T = tt(); codes = T && T.lines ? Object.keys(T.lines) : []; } catch (e) {}
      const later = f => (window.requestIdleCallback ? requestIdleCallback(f, {timeout: 3000}) : setTimeout(f, 120));
      const step = () => {
        if (codes.length){ try { lineGraph(codes.shift()); } catch (e) {} later(step); return; }
        try { checkFeed(); } catch (e) { diag("error", "Timetable comparison failed: " + (e && e.message || e)); }
      };
      later(step);
    }, 8000);
  });
})();

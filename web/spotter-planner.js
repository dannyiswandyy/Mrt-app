/* ---------- Spotter planner: when trains pass a station, from LTA's timetable ----------
   A simpler take on MRT Dev's Train Spotter Schedule, made to go into the public app as it is.
   - Pick a line, a station, a day and a part of the day; the list updates straight away.
   - Each train: time, which way, where it ends, platform, its train slot (LTA's scheduled duty, the number in the
     GTFS trip id; a slot is a duty, never a particular trainset), first / last train, short trips that end early,
     trips that start, end or turn round here, and when the same train is due back at this station
     (followed through the day with the timetable's run links, ttLinks).
   - Summary: how many trains, how often (the usual gap), first and last train each way, and how many slots run.
   - GTFS trip ids are there for the curious, behind a switch; "Copy list" puts the list on the clipboard.
   Uses only the page's own timetable helpers (LINES, ttTrips, ttSlotOf, ttLinks, activeStations, platOf, isShortTo,
   endsName, dest, sgNow), which the public app's page has too. */
(() => {
  if (window.__spotterPlannerLoaded) return; window.__spotterPlannerLoaded = true;
  const PREVIEW = false;   // MRT Dev only: label the tile as the public app's preview. Set to false in the public app.
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const pad = n => String(n).padStart(2, "0");
  const hm = sec => { sec = Math.round(sec); return pad(Math.floor(sec / 3600) % 24) + ":" + pad(Math.floor(sec % 3600 / 60)); };
  const lname = c => c === "CG" ? "CGL" : c;
  const now = () => { try { return sgNow(); } catch(e){ const d = new Date(Date.now() + 8 * 3600e3); return {iso: d.toISOString().slice(0, 10), mins: d.getUTCHours() * 60 + d.getUTCMinutes()}; } };
  const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const nextDow = (iso, w) => { const d = new Date(iso + "T00:00:00Z"); return addDays(iso, (w - d.getUTCDay() + 7) % 7 || 7); };
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayName = iso => { const d = new Date(iso + "T00:00:00Z"); return DOW[d.getUTCDay()] + " " + d.getUTCDate() + " " + MON[d.getUTCMonth()]; };
  // parts of the day, in seconds of the service day (it runs past midnight)
  const WINS = [["next", "Next 2 h"], ["all", "All day", 0, 30], ["am", "AM peak", 7, 9.5], ["mid", "Midday", 9.5, 17], ["pm", "PM peak", 17, 20], ["night", "Night", 20, 30]];

  const style = document.createElement("style");
  style.textContent = `
#splBtn{position:relative}
.quick #splBtn{grid-column:1/-1}
.tiles #splBtn{position:relative;right:auto;bottom:auto;z-index:auto}
#splMask{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.42);display:none;padding:clamp(8px,3vw,24px);box-sizing:border-box;overflow:auto;
  -webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}
#spl{max-width:720px;margin:2vh auto;background:var(--panel);color:var(--fg);border:1px solid var(--rule);border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,.42);overflow:hidden}
#spl .splHead{position:sticky;top:0;z-index:2;padding:14px 16px;background:var(--panel);border-bottom:1px solid var(--rule);display:flex;justify-content:space-between;align-items:center;gap:12px}
#spl h2{margin:0;font:700 20px/1.1 var(--display)}
#spl .splSub{margin:3px 0 0;color:var(--muted);font:500 12px var(--body)}
#spl .splX{background:var(--soft);color:var(--fg);border:1px solid var(--rule);width:40px;height:40px;border-radius:12px;font-size:22px;line-height:1;cursor:pointer;flex:0 0 auto}
#spl .splBody{padding:12px 16px 20px}
#spl .splPick{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:8px}
#spl select,#spl input[type=date]{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid var(--rule);border-radius:10px;background:var(--bg);color:var(--fg);font:600 14px var(--body);min-height:42px}
#spl .splChips{display:flex;gap:6px;overflow-x:auto;padding:8px 0 0;scrollbar-width:none}
#spl .splChips::-webkit-scrollbar{display:none}
#spl .splChips button,#spl .splChips label{flex:0 0 auto;border:1px solid var(--rule);border-radius:999px;padding:7px 11px;background:var(--panel);color:var(--fg);font:700 12px var(--body);cursor:pointer;white-space:nowrap}
#spl .splChips button[aria-pressed=true]{background:var(--fg);color:var(--bg);border-color:var(--fg)}
#spl .splChips label{position:relative;display:inline-flex;align-items:center}
#spl .splChips label input{position:absolute;inset:0;opacity:0;width:100%;min-height:0;padding:0;cursor:pointer}
#spl .splChips label.on{background:var(--fg);color:var(--bg);border-color:var(--fg)}
#spl .splSum{margin:12px 0 4px;padding:12px 13px;border-radius:14px;background:var(--soft);border:1px solid var(--rule)}
#spl .splSum b.t{font:700 17px var(--display)}
#spl .splStats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px 12px;margin-top:8px}
#spl .splStats div{font-size:12px;color:var(--muted);line-height:1.35}
#spl .splStats b{display:block;color:var(--fg);font:700 14px var(--body);font-variant-numeric:tabular-nums}
#spl .splRow{display:grid;grid-template-columns:52px 20px minmax(0,1fr) auto;gap:8px;align-items:start;padding:10px 2px;border-bottom:1px solid var(--rule)}
#spl .splRow.past{opacity:.45}
#spl .splRow.arr{padding:6px 2px}#spl .splRow.arr .splTime{font-size:13px;color:var(--muted)}#spl .splRow.arr .splSlot{font-size:11px;padding:2px 5px;opacity:.8}
#spl .splTime{font:800 16px var(--mono);font-variant-numeric:tabular-nums;padding-top:1px}
#spl .splDir{font-weight:900;text-align:center;padding-top:1px}
#spl .splTo{font:700 14px var(--body)}
#spl .splMeta{font-size:11.5px;color:var(--muted);line-height:1.4}
#spl .splSlot{font:800 12px var(--mono);border:1px solid var(--rule);border-radius:8px;padding:3px 6px;white-space:nowrap;background:var(--bg)}
#spl .splTag{display:inline-block;font:800 10px var(--body);letter-spacing:.04em;text-transform:uppercase;border-radius:6px;padding:2px 5px;margin:3px 4px 0 0;background:var(--soft);color:var(--fg);border:1px solid var(--rule)}
#spl .splTag.hot{background:var(--fg);color:var(--bg);border-color:var(--fg)}
#spl .splNow{display:flex;align-items:center;gap:8px;margin:2px 0;color:var(--warn);font:800 11px var(--body);letter-spacing:.06em;text-transform:uppercase}
#spl .splNow::after{content:"";flex:1;border-top:2px solid var(--warn)}
#spl .splTid{font:500 10.5px var(--mono);color:var(--muted);word-break:break-all}
#spl .splFoot{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
#spl .splFoot button{border:1px solid var(--rule);border-radius:11px;padding:9px 12px;font:700 13px var(--body);background:var(--panel);color:var(--fg);cursor:pointer}
#spl .splSwitch{display:inline-flex;align-items:center;gap:6px;font:600 12.5px var(--body);color:var(--muted);cursor:pointer}
#spl .splNote{margin-top:10px;font-size:11.5px;color:var(--muted);line-height:1.45}
#spl .splEmpty{padding:18px 4px;color:var(--muted);text-align:center}
@media(max-width:560px){#splMask{padding:6px}#spl{margin:0 auto;border-radius:18px}#spl .splPick{grid-template-columns:1fr}#spl .splRow{grid-template-columns:46px 16px minmax(0,1fr) auto;gap:6px}}
`;
  document.head.appendChild(style);

  let btn = document.querySelector("#splBtn");
  const quick = document.querySelector("#viewHome .quick");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "splBtn";
    btn.type = "button";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.className = "spot-quick planner-quick";
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M8 3v4M16 3v4M4 9h16"/><path d="M8 13h3M13 13h3M8 16h3"/></svg><span class="spot-quick-title">Spotter planner</span><span>See every scheduled train at a station</span><b>Open planner ›</b>';
  }
  if (quick && btn.parentNode !== quick) quick.appendChild(btn);

  const mask = document.createElement("div");
  mask.id = "splMask"; mask.setAttribute("role", "presentation");
  mask.innerHTML = `<section id="spl" role="dialog" aria-modal="true" aria-labelledby="splTitle">
    <div class="splHead"><div><h2 id="splTitle">Spotter planner</h2><div class="splSub">When trains pass a station · LTA timetable</div></div>
      <button type="button" class="splX" aria-label="Close">×</button></div>
    <div class="splBody">
      <div class="splPick"><select id="splLine" aria-label="Line"></select><select id="splSt" aria-label="Station"></select></div>
      <div class="splChips" id="splDay" aria-label="Day"></div>
      <div class="splChips" id="splWin" aria-label="Part of the day"></div>
      <div class="splChips" id="splDirs" aria-label="Direction"></div>
      <div id="splOut" aria-live="polite"></div>
      <div class="splFoot">
        <button type="button" id="splCopy">Copy list</button>
        <label class="splSwitch"><input type="checkbox" id="splIds"> GTFS trip ids</label>
      </div>
      <p class="splNote">Times are LTA's timetable (GTFS), not live running. A <b>slot</b> is the scheduled duty in LTA's trip id: the same slot is the same scheduled train through the day, but which physical train set runs it isn't published.</p>
    </div></section>`;
  document.body.appendChild(mask);

  const $ = id => mask.querySelector("#" + id);
  const S = {line: "", st: 0, iso: now().iso, win: "next", dir: "both", ids: false};
  try { const o = JSON.parse(localStorage.getItem("mrt.spl") || "{}"); if (o.line) S.line = o.line; if (o.st != null) S.st = +o.st; S.ids = !!o.ids; } catch(e){}
  const save = () => { try { localStorage.setItem("mrt.spl", JSON.stringify({line: S.line, st: S.st, ids: S.ids})); } catch(e){} };

  const has = (c, iso) => { try { return !!ttTrips(c, iso); } catch(e){ return false; } };
  function chips(box, items, on, attr){
    box.innerHTML = items.map(([v, t]) => `<button type="button" data-${attr}="${esc(v)}" aria-pressed="${v === on}">${esc(t)}</button>`).join("");
  }
  function fill(){
    const t = now().iso, ls = Object.keys(LINES || {}).filter(c => has(c, S.iso));
    if (!ls.includes(S.line)) S.line = ls.includes("NSL") ? "NSL" : ls[0] || "";
    $("splLine").innerHTML = ls.map(c => `<option value="${esc(c)}">${esc(lname(c))} · ${esc(LINES[c].name || "")}</option>`).join("");
    $("splLine").value = S.line;
    const sts = S.line ? activeStations(LINES[S.line], S.iso) : [];
    if (!(S.st >= 0 && S.st < sts.length)) S.st = 0;
    $("splSt").innerHTML = sts.map((s, i) => `<option value="${i}">${esc(s[1])} (${esc(s[0])})</option>`).join("");
    $("splSt").value = String(S.st);
    // days: today, tomorrow, the coming Saturday and Sunday, or any date
    const days = [[t, "Today"], [addDays(t, 1), "Tomorrow"]];
    for (const w of [6, 0]){ const d = nextDow(t, w); if (!days.some(x => x[0] === d)) days.push([d, dayName(d)]); }
    const picked = !days.some(x => x[0] === S.iso);
    chips($("splDay"), days, S.iso, "day");
    $("splDay").insertAdjacentHTML("beforeend", `<label class="${picked ? "on" : ""}">${picked ? esc(dayName(S.iso)) : "Pick a date"}<input type="date" id="splDate" value="${esc(S.iso)}" aria-label="Pick a date"></label>`);
    if (S.win === "next" && S.iso !== t) S.win = "all";
    chips($("splWin"), WINS.filter(w => w[0] !== "next" || S.iso === t), S.win, "win");
    const L = LINES[S.line];
    if (L && sts.length){
      chips($("splDirs"), [["both", "Both ways"], ["0", "→ " + dest(L, 0, sts)], ["1", "← " + dest(L, 1, sts)]], S.dir, "dir");
    } else $("splDirs").innerHTML = "";
    $("splIds").checked = S.ids;
  }

  // Every train calling at the station that day: {t, r, k, dir, at (station index), end, last}
  function passes(code, iso, si){
    const runs = ttTrips(code, iso); if (!runs) return null;
    const out = [];
    for (const r of runs){
      const p = r.p, k = (si - p.f) / p.d;
      if (!Number.isInteger(k) || k < 0 || k >= p.arr.length) continue;
      const n = p.arr.length - 1, ends = k === n;
      out.push({t: r.s + (ends ? p.arr[k] : p.dep[k]), r, k, n, dir: p.d > 0 ? 0 : 1, end: p.f + p.d * n, ends, starts: k === 0, slot: ttSlotOf(r.tid)});
    }
    out.sort((a, b) => a.t - b.t);
    // the same train through the day, from the timetable's run links (a run, then the run it turns round into)
    let links = null; try { links = ttLinks(runs).next; } catch(e){}
    if (links){
      const at = new Map(out.map(p => [p.r, p]));
      for (const p of out){
        // a train that ends here and leaves again as its next run: one row, "in from ... at ..., turns round"
        const nx = links.get(p.r), q = p.ends && nx && at.get(nx);
        if (q && q.starts && q.t - p.t >= 30){ q.inFrom = p; p.folded = true; }   // only when it really gets in first
        // the next time this train calls here
        let r = p.r, hop = 0;
        while ((r = links.get(r)) && hop++ < 12){ const b = at.get(r); if (b && !b.folded && b.t - p.t >= 120 && !(b.inFrom && b.inFrom === p)){ p.back = b; break; } }
      }
    }
    return out.filter(p => !p.folded);
  }
  const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const mins = s => { const m = s / 60; return m < 10 ? (Math.round(m * 2) / 2).toString().replace(".5", "½") : String(Math.round(m)); };

  let lastRows = [];
  function render(){
    const out = $("splOut"), code = S.line, L = LINES[code];
    if (!L){ out.innerHTML = '<div class="splEmpty">The timetable is still loading. Try again in a moment.</div>'; return; }
    const sts = activeStations(L, S.iso), st = sts[S.st], all = passes(code, S.iso, S.st);
    if (!all || !st){ out.innerHTML = '<div class="splEmpty">No LTA timetable for this line on that day.</div>'; return; }
    const N = now(), isToday = S.iso === N.iso, nowS = N.mins * 60;
    let from = 0, to = 30 * 3600;
    if (S.win === "next"){ from = nowS - 5 * 60; to = nowS + 2 * 3600; }
    else { const w = WINS.find(x => x[0] === S.win) || WINS[1]; from = w[2] * 3600; to = w[3] * 3600; }
    // first / last train each way at this station (trips that end here don't count as departures)
    const fl = [0, 1].map(d => { const x = all.filter(p => p.dir === d && !p.ends); return x.length ? [x[0], x[x.length - 1]] : null; });
    const rows = all.filter(p => p.t >= from && p.t < to && (S.dir === "both" || String(p.dir) === S.dir));
    lastRows = rows;

    const gaps = [0, 1].map(d => { const x = rows.filter(p => p.dir === d && !p.ends); const g = []; for (let i = 1; i < x.length; i++) g.push(x[i].t - x[i - 1].t); return g; });
    const slots = new Set(rows.filter(p => !p.ends).map(p => p.slot).filter(Boolean));
    const shorts = rows.filter(p => !p.ends && isShortTo(L, p.dir, sts, p.end)).length;
    const dirName = d => dest(L, d, sts);
    const stat = (k, v) => `<div><b>${v}</b>${esc(k)}</div>`;
    const every = [0, 1].filter(d => gaps[d].length && (S.dir === "both" || String(d) === S.dir))
      .map(d => stat("usual gap to " + dirName(d) + (gaps[d].length ? " · longest " + mins(Math.max(...gaps[d])) + " min" : ""), "every " + mins(median(gaps[d])) + " min"));
    const firstLast = [0, 1].filter(d => fl[d] && (S.dir === "both" || String(d) === S.dir))
      .map(d => stat("first · last to " + dirName(d), hm(fl[d][0].t) + " · " + hm(fl[d][1].t)));
    let html = `<div class="splSum"><b class="t">${esc(lname(code))} · ${esc(st[1])}</b> <span class="splMeta">${esc(dayName(S.iso))}${S.win === "next" ? " · next 2 hours" : ""}</span>
      <div class="splStats">${stat("trains", rows.filter(p => !p.ends).length)}${slots.size ? stat("train slots out", slots.size) : ""}${shorts ? stat("short trips", shorts) : ""}${every.join("")}${firstLast.join("")}</div></div>`;
    if (!rows.length){ out.innerHTML = html + '<div class="splEmpty">No trains in this part of the day.</div>'; return; }

    let nowDone = !isToday;
    for (const p of rows){
      if (!nowDone && p.t >= nowS){ html += '<div class="splNow">Now ' + hm(nowS) + "</div>"; nowDone = true; }
      const short = !p.ends && isShortTo(L, p.dir, sts, p.end), endSt = sts[p.end];
      const plat = typeof platOf === "function" ? platOf(code, S.st, p.dir) : "";
      const tags = [];
      if (fl[p.dir] && p === fl[p.dir][0]) tags.push(["First train", 1]);
      if (fl[p.dir] && p === fl[p.dir][1]) tags.push(["Last train", 1]);
      if (short) tags.push(["Short trip", 0]);
      if (p.starts && !p.ends && !p.inFrom) tags.push(["Starts here", 0]);
      if (p.inFrom) tags.push(["Turns round here", 0]);
      if (p.ends) tags.push(["Ends here", 0]);
      const back = p.back ? "back here " + hm(p.back.t) + (p.back.dir !== p.dir ? " the other way" : "") : "";
      const inFrom = p.inFrom ? "in " + hm(p.inFrom.t) + " from " + ((sts[p.inFrom.r.p.f] || [])[1] || "the line") + ", turns round in " + mins(p.t - p.inFrom.t) + " min" : "";
      if (p.ends){   // a train that ends its trip here: one short line
        html += `<div class="splRow arr${isToday && p.t < nowS - 60 ? " past" : ""}"><div class="splTime">${hm(p.t)}</div><div class="splDir" aria-hidden="true">■</div>
          <div class="splMeta">Arrives from ${esc((sts[p.r.p.f] || [])[1] || "the line")}, ends here${S.ids ? `<div class="splTid">${esc(p.r.tid)}</div>` : ""}</div>
          <div>${p.slot ? `<span class="splSlot" title="Train run T${esc(p.slot)} (scheduled duty)">T${esc(p.slot)}</span>` : ""}</div></div>`;
        continue;
      }
      const to = p.ends ? "Arrives, terminates here" : "to " + (short ? endsName(L, p.dir, sts, p.end) : (endSt ? endSt[1] : dirName(p.dir)));
      html += `<div class="splRow${isToday && p.t < nowS - 60 ? " past" : ""}"><div class="splTime">${hm(p.t)}</div><div class="splDir" aria-hidden="true">${p.ends ? "■" : p.dir ? "←" : "→"}</div>
        <div><div class="splTo">${esc(to)}</div><div class="splMeta">${[plat && !p.ends ? "Platform " + plat : "", inFrom, back].filter(Boolean).map(esc).join(" · ")}</div>
        ${tags.map(([t, h]) => `<span class="splTag${h ? " hot" : ""}">${esc(t)}</span>`).join("")}${S.ids ? `<div class="splTid">${esc(p.r.tid)}</div>` : ""}</div>
        <div>${p.slot ? `<span class="splSlot" title="Train run T${esc(p.slot)} (scheduled duty)">T${esc(p.slot)}</span>` : ""}</div></div>`;
    }
    out.innerHTML = html;
  }
  const update = () => { try { fill(); render(); save(); } catch(e){ $("splOut").innerHTML = '<div class="splEmpty">Couldn\'t build the list: ' + esc(e.message) + "</div>"; } };

  $("splLine").onchange = e => { S.line = e.target.value; S.st = 0; S.dir = "both"; update(); };
  $("splSt").onchange = e => { S.st = +e.target.value; update(); };
  mask.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (e.target === mask || (b && b.classList.contains("splX"))) return close();
    if (!b) return;
    if (b.dataset.day){ S.iso = b.dataset.day; update(); }
    else if (b.dataset.win){ S.win = b.dataset.win; update(); }
    else if (b.dataset.dir){ S.dir = b.dataset.dir; update(); }
  });
  mask.addEventListener("change", e => {
    if (e.target.id === "splDate" && /^\d{4}-\d\d-\d\d$/.test(e.target.value)){ S.iso = e.target.value; update(); }
    if (e.target.id === "splIds"){ S.ids = e.target.checked; update(); }
  });
  $("splCopy").onclick = () => {
    const L = LINES[S.line], sts = L ? activeStations(L, S.iso) : [], st = sts[S.st];
    if (!st) return;
    const txt = `${lname(S.line)} · ${st[1]} · ${dayName(S.iso)} (LTA timetable)\n` + lastRows.map(p => {
      const e = sts[p.end];
      return `${hm(p.t)} ${p.ends ? "terminates" : (p.dir ? "← " : "→ ") + (e ? e[1] : "")}${p.slot ? " · T" + p.slot : ""}`;
    }).join("\n");
    const ok = () => { $("splCopy").textContent = "Copied"; setTimeout(() => { $("splCopy").textContent = "Copy list"; }, 1500); };
    try { navigator.clipboard.writeText(txt).then(ok, () => {}); } catch(e){}
  };
  let opener = null;
  function open(){
    opener = document.activeElement; S.iso = now().iso; S.win = "next";
    mask.style.display = "block"; document.body.style.overflow = "hidden"; update();
    setTimeout(() => { const n = $("splOut").querySelector(".splNow"); if (n) n.scrollIntoView({block: "center"}); mask.querySelector(".splX").focus({preventScroll: true}); }, 0);
  }
  function close(){ mask.style.display = "none"; document.body.style.overflow = ""; if (opener && opener.focus) opener.focus(); }
  btn.onclick = open;
  document.addEventListener("keydown", e => { if (e.key === "Escape" && mask.style.display === "block") close(); });
  window.openSpotterPlanner = open;
})();

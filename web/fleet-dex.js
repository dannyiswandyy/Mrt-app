/* MRT Spotter – Interactive Fleet Dex (Spotting Checklist) & Live Duty Trainset Tracker.
   Tracks spotted/ridden trainsets by rolling stock with completion stats, projects today's
   spotted trainsets across all turnarounds of their GTFS run/slot, and alerts when a
   watched set is approaching your station. */
(() => {
  "use strict";

  const W = typeof window !== "undefined" ? window : globalThis;
  if (W.__mrtFleetDexLoaded) return;
  W.__mrtFleetDexLoaded = true;

  const WATCH_KEY = "mrt.watch";
  const HOME_ST_KEY = "mrt.fleetDex.watchStation";
  const ALERTED_KEY = "mrt.fleetDex.alerted";

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  const pad = n => String(Math.floor(n)).padStart(2, "0");

  function rangePairs(startOdd, count, padDigits) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const a = startOdd + i * 2;
      const b = a + 1;
      const fmt = n => padDigits ? String(n).padStart(padDigits, "0") : String(n);
      out.push(`${fmt(a)}/${fmt(b)}`);
    }
    return out;
  }

  function rangeSingle(start, count, padDigits) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const n = start + i;
      out.push(padDigits ? String(n).padStart(padDigits, "0") : String(n));
    }
    return out;
  }

  /* Official active Singapore MRT/LRT fleet set rosters grouped by line family */
  const FLEET_ROSTER = [
    {
      group: "NSEWL",
      title: "North-South & East-West Lines",
      lines: ["NSL", "EWL", "CG"],
      color: "var(--NSL)",
      models: [
        { model: "R151", note: "Alstom Movia (6-car)", sets: rangePairs(801, 106, 3) },
        { model: "C151C", note: "Kawasaki–CRRC Qingdao Sifang", sets: rangePairs(701, 12, 3) },
        { model: "C151B", note: "Kawasaki–CSR Qingdao Sifang", sets: rangePairs(601, 45, 3) },
        { model: "C151A", note: "Kawasaki–CSR Qingdao Sifang", sets: rangePairs(501, 35, 3) }
      ]
    },
    {
      group: "NEL",
      title: "North East Line",
      lines: ["NEL"],
      color: "var(--NEL)",
      models: [
        { model: "C851E", note: "Alstom Metropolis (6-car)", sets: rangePairs(7087, 6, 4) },
        { model: "C751C", note: "Alstom Metropolis (6-car)", sets: rangePairs(7051, 18, 4) },
        { model: "C751A", note: "Alstom Metropolis (6-car)", sets: rangePairs(7001, 25, 4) }
      ]
    },
    {
      group: "CCL",
      title: "Circle Line",
      lines: ["CCL"],
      color: "var(--CCL)",
      models: [
        { model: "C851E", note: "Alstom Metropolis (3-car)", sets: rangeSingle(8065, 23, 4) },
        { model: "C830C", note: "Alstom Metropolis (3-car)", sets: rangeSingle(8041, 24, 4) },
        { model: "C830", note: "Alstom Metropolis (3-car)", sets: rangeSingle(8001, 40, 4) }
      ]
    },
    {
      group: "DTL",
      title: "Downtown Line",
      lines: ["DTL"],
      color: "var(--DTL)",
      models: [
        { model: "C951 / C951A", note: "Bombardier Movia (3-car)", sets: rangeSingle(9001, 92, 4) }
      ]
    },
    {
      group: "TEL",
      title: "Thomson-East Coast Line",
      lines: ["TEL"],
      color: "var(--TEL)",
      models: [
        { model: "T251", note: "Kawasaki–CRRC (4-car)", sets: rangeSingle(2001, 91, 4) }
      ]
    },
    {
      group: "BPLRT",
      title: "Bukit Panjang LRT",
      lines: ["BP"],
      color: "var(--BP)",
      models: [
        { model: "C801B", note: "Alstom Innovia APM 300R", sets: rangeSingle(133, 19, 3) },
        { model: "C801A", note: "Bombardier Innovia APM 100", sets: rangeSingle(120, 13, 3) }
      ]
    }
  ];

  function normSet(v) {
    return String(v || "").trim().toUpperCase().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").slice(0, 16);
  }

  function sgDay(ms) {
    return new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);
  }

  function fmtHm(ms) {
    const d = new Date(ms + 8 * 3600e3);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }

  function fmtSecClock(sec) {
    const mins = ((Math.round(sec / 60) % 1440) + 1440) % 1440;
    return `${pad(mins / 60)}:${pad(mins % 60)}`;
  }

  function slotFromTid(tid) {
    const m = /_(\d+)_\d+$/.exec(String(tid || ""));
    return m ? m[1].replace(/^0+/, "") || "0" : "";
  }

  /**
   * Build completion statistics for a Fleet Dex group against the user's sightings.
   */
  function buildFleetProgress(spots, groupId) {
    const grp = FLEET_ROSTER.find(g => g.group === groupId) || FLEET_ROSTER[0];
    const lineSet = new Set(grp.lines);
    const seenMap = new Map();

    for (const s of Array.isArray(spots) ? spots : []) {
      if (!s || !s.set) continue;
      if (s.line && !lineSet.has(s.line)) continue;
      const key = normSet(s.set);
      const prev = seenMap.get(key);
      if (!prev) {
        seenMap.set(key, {
          set: key,
          count: 1,
          rode: s.kind === "ride",
          lastAt: s.at || 0,
          lastSt: s.st || "",
          lastLine: s.line || grp.lines[0]
        });
      } else {
        prev.count++;
        if (s.kind === "ride") prev.rode = true;
        if ((s.at || 0) > prev.lastAt) {
          prev.lastAt = s.at || 0;
          prev.lastSt = s.st || prev.lastSt;
          prev.lastLine = s.line || prev.lastLine;
        }
      }
    }

    let totalSets = 0;
    let spottedSets = 0;
    let rodeSets = 0;

    const models = grp.models.map(m => {
      let mSpotted = 0;
      let mRode = 0;
      const items = m.sets.map(setNo => {
        const hit = seenMap.get(normSet(setNo)) || null;
        if (hit) {
          mSpotted++;
          if (hit.rode) mRode++;
        }
        return { set: setNo, hit };
      });
      totalSets += m.sets.length;
      spottedSets += mSpotted;
      rodeSets += mRode;
      return {
        model: m.model,
        note: m.note,
        total: m.sets.length,
        spotted: mSpotted,
        rode: mRode,
        pct: m.sets.length ? Math.round((mSpotted / m.sets.length) * 100) : 0,
        items
      };
    });

    return {
      group: grp.group,
      title: grp.title,
      color: grp.color,
      lines: grp.lines,
      totalSets,
      spottedSets,
      rodeSets,
      pct: totalSets ? Math.round((spottedSets / totalSets) * 100) : 0,
      models
    };
  }

  /**
   * Project today's spotted trainsets across all live and upcoming runs sharing the same GTFS slot.
   */
  function projectTrackedDuties(opts) {
    const options = opts || {};
    const spots = Array.isArray(options.spots) ? options.spots : [];
    const iso = options.iso || (typeof sgNow === "function" ? sgNow().iso : "2026-11-25");
    const nowMins = typeof options.nowMins === "number" ? options.nowMins : (typeof sgNow === "function" ? sgNow().mins : 0);
    const linesMap = options.lines || (typeof LINES !== "undefined" ? LINES : {});
    const getTrains = options.getTrains || (typeof trainsOn === "function" ? (c => trainsOn(c, sgNow())) : () => []);
    const getTrips = options.getTrips || (typeof ttTrips === "function" ? (c => ttTrips(c, iso)) : () => []);

    // Latest sighting per (line, slot) today
    const bySlot = new Map();
    for (const s of spots) {
      if (!s || !s.set || !s.slot || !s.line) continue;
      if (sgDay(s.at || 0) !== iso) continue;
      const k = `${s.line}|${String(s.slot)}`;
      const prev = bySlot.get(k);
      if (!prev || (s.at || 0) > (prev.at || 0)) {
        bySlot.set(k, s);
      }
    }

    const nowSec = nowMins * 60;
    const out = [];

    for (const s of bySlot.values()) {
      const L = linesMap[s.line];
      const stations = L && Array.isArray(L.stations) ? L.stations : [];
      const activeList = getTrains(s.line) || [];
      const liveTrain = activeList.find(t => t && t.ref && slotFromTid(t.ref.tid) === String(s.slot)) || null;

      let status = "scheduled";
      let locationText = "Between trips / in turnaround";
      let nextTurnaround = "";
      let liveTrainId = "";
      let upcomingStops = [];

      if (liveTrain && stations.length) {
        status = "live";
        liveTrainId = liveTrain.id || "";
        const nextIdx = Math.max(0, Math.min(stations.length - 1, Math.round(liveTrain.next ?? liveTrain.idx ?? 0)));
        const nextSt = stations[nextIdx];
        const toIdx = Math.max(0, Math.min(stations.length - 1, liveTrain.to ?? (liveTrain.dir ? 0 : stations.length - 1)));
        const toSt = stations[toIdx];
        locationText = `${liveTrain.atStation ? "At" : "Approaching"} ${nextSt ? nextSt[1] : "station"} → ${toSt ? toSt[1] : ""}`;

        // Estimate upcoming station ETAs along the live train's direction
        if (liveTrain.ref && liveTrain.ref.p && Array.isArray(liveTrain.ref.p.arr)) {
          const p = liveTrain.ref.p;
          const rStart = liveTrain.ref.s;
          for (let k = 0; k < p.arr.length; k++) {
            const stIdx = p.f + k * p.d;
            const arrSec = rStart + p.arr[k];
            const etaMin = Math.round((arrSec - nowSec) / 60);
            if (etaMin >= 0 && etaMin <= 20 && stations[stIdx]) {
              upcomingStops.push({
                code: stations[stIdx][0],
                name: stations[stIdx][1],
                etaMin,
                clock: fmtSecClock(arrSec)
              });
            }
          }
        }
      }

      // Look up remaining trips for this exact slot today
      const trips = (getTrips(s.line) || []).filter(r => r && slotFromTid(r.tid) === String(s.slot));
      const futureTrip = trips.find(r => r.s > nowSec);
      if (futureTrip && futureTrip.p && stations.length) {
        const startSt = stations[futureTrip.p.f];
        const endIdx = futureTrip.p.f + (futureTrip.p.arr.length - 1) * futureTrip.p.d;
        const endSt = stations[endIdx];
        nextTurnaround = `Next trip ${fmtSecClock(futureTrip.s)} (${startSt ? startSt[1] : ""} → ${endSt ? endSt[1] : ""})`;
      } else if (!liveTrain && trips.length) {
        status = "finished";
        locationText = "Duty finished for today";
      }

      out.push({
        set: normSet(s.set),
        model: s.model || "",
        line: s.line,
        slot: String(s.slot),
        spottedAt: s.at || 0,
        spottedClock: fmtHm(s.at || 0),
        spottedStation: s.st || "",
        status,
        liveTrainId,
        locationText,
        nextTurnaround,
        upcomingStops,
        tripsToday: trips.length
      });
    }

    out.sort((a, b) => (a.status === "live" ? 0 : 1) - (b.status === "live" ? 0 : 1) || b.spottedAt - a.spottedAt);
    return out;
  }

  /**
   * Check whether any watched set on a tracked duty is approaching `stationName` within `withinMin` minutes.
   */
  function findApproachingWatchedSets(trackedDuties, watchList, stationName, withinMin) {
    if (!stationName || !Array.isArray(watchList) || !watchList.length) return [];
    const wanted = new Set(watchList.map(normSet));
    const target = String(stationName).trim().toLowerCase();
    const limit = Number.isFinite(withinMin) ? withinMin : 5;
    const hits = [];

    for (const d of Array.isArray(trackedDuties) ? trackedDuties : []) {
      if (d.status !== "live" || !wanted.has(normSet(d.set))) continue;
      const stop = (d.upcomingStops || []).find(st =>
        st.etaMin <= limit &&
        (st.name.toLowerCase() === target || st.code.toLowerCase() === target)
      );
      if (stop) {
        hits.push({
          set: d.set,
          line: d.line,
          slot: d.slot,
          stationName: stop.name,
          stationCode: stop.code,
          etaMin: stop.etaMin,
          clock: stop.clock
        });
      }
    }
    return hits;
  }

  const api = {
    FLEET_ROSTER,
    buildFleetProgress,
    projectTrackedDuties,
    findApproachingWatchedSets,
    normSet
  };
  W.mrtFleetDex = api;

  /* ---------------- Browser Runtime & UI ---------------- */
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const ready = () => {
    try {
      return typeof sgNow === "function" && typeof LINES === "object" && typeof store === "object" && typeof window.spotLog === "function" && document.getElementById("spotRoot");
    } catch (_) {
      return false;
    }
  };

  let tries = 0;
  (function wait() {
    if (ready()) {
      try { initUI(); } catch (err) { try { console.warn("fleet-dex.js", err); } catch (_) {} }
    } else if (++tries < 250) {
      setTimeout(wait, 200);
    }
  })();

  function initUI() {
    if (W.__mrtFleetDexUIReady) return;
    W.__mrtFleetDexUIReady = true;

    injectStyles();

    let activeGroup = "NSEWL";
    let showMissingOnly = false;

    function getWatch() {
      const list = store.get(WATCH_KEY, []);
      return Array.isArray(list) ? list.map(normSet).filter(Boolean) : [];
    }

    function toggleWatch(setNo) {
      const key = normSet(setNo);
      if (!key) return;
      const list = getWatch();
      const idx = list.indexOf(key);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(key);
      store.set(WATCH_KEY, list);
      renderSection();
    }

    function getWatchStation() {
      const saved = store.get(HOME_ST_KEY, "");
      if (saved) return String(saved);
      try {
        const favs = store.get("mrt.favs", []);
        if (Array.isArray(favs) && favs.length) return String(favs[0]);
      } catch (_) {}
      return "";
    }

    function allStationNames() {
      const set = new Set();
      for (const L of Object.values(LINES || {})) {
        if (!L || !Array.isArray(L.stations)) continue;
        for (const s of L.stations) if (s && s[1]) set.add(s[1]);
      }
      return [...set].sort();
    }

    function renderSection() {
      const spotRoot = document.getElementById("spotRoot");
      if (!spotRoot) return;
      let host = document.getElementById("mrtFleetDexHost");
      if (!host) {
        host = document.createElement("section");
        host.id = "mrtFleetDexHost";
        host.className = "fdx-root";
        spotRoot.appendChild(host);
      }

      const spots = window.spotLog ? window.spotLog() : [];
      const watchList = getWatch();
      const watchSet = new Set(watchList);
      const watchSt = getWatchStation();
      const now = sgNow();
      const tracked = projectTrackedDuties({ spots, iso: now.iso, nowMins: now.mins });
      const prog = buildFleetProgress(spots, activeGroup);

      const trackedHTML = tracked.length
        ? `<div class="fdx-duty-list">${tracked.map(d => `<div class="fdx-duty is-${d.status}" style="--c:var(--${esc(d.line)})">
            <div class="fdx-duty-main">
              <div class="fdx-duty-top">
                <span class="fdx-chip">${esc(d.line === "CG" ? "CGL" : d.line)}</span>
                <b>${esc(d.set)}${d.model ? ` · ${esc(d.model)}` : ""}</b>
                <span class="fdx-slot">Run T${esc(d.slot.padStart(3, "0"))}</span>
                ${watchSet.has(d.set) ? `<span class="fdx-star">★ Watched</span>` : ""}
              </div>
              <p class="fdx-loc">${esc(d.locationText)}</p>
              <small>${d.nextTurnaround ? `${esc(d.nextTurnaround)} · ` : ""}Spotted ${esc(d.spottedClock)} at ${esc(d.spottedStation)}</small>
            </div>
            ${d.status === "live" && d.liveTrainId ? `<button type="button" class="fdx-jump" data-fdx-jump-line="${esc(d.line)}" data-fdx-jump-id="${esc(d.liveTrainId)}">Locate ›</button>` : ""}
          </div>`).join("")}</div>`
        : `<p class="fdx-empty">Log a sighting with a <b>set number</b> from any train's card today, and the app will track that exact trainset across every turnaround of its duty.</p>`;

      const groupsHTML = FLEET_ROSTER.map(g =>
        `<button type="button" data-fdx-grp="${esc(g.group)}" aria-selected="${g.group === activeGroup}" style="--c:${g.color}">${esc(g.group)}</button>`
      ).join("");

      const modelsHTML = prog.models.map(m => {
        const shown = showMissingOnly ? m.items.filter(i => !i.hit) : m.items;
        return `<details class="fdx-model" open>
          <summary>
            <span><b>${esc(m.model)}</b> <small>${esc(m.note)}</small></span>
            <span class="fdx-mstat">${m.spotted}/${m.total} (${m.pct}%)</span>
          </summary>
          <div class="fdx-grid">${shown.map(it => {
            const w = watchSet.has(normSet(it.set));
            const cls = it.hit ? (it.hit.rode ? " is-rode" : " is-spot") : "";
            const title = it.hit
              ? `${it.set} · ${it.hit.rode ? "Rode" : "Spotted"} ${it.hit.count}x · last ${it.hit.lastSt}`
              : `${it.set} · Not spotted yet — tap to watch`;
            return `<button type="button" class="fdx-cell${cls}${w ? " is-watch" : ""}" data-fdx-watch="${esc(it.set)}" title="${esc(title)}">${w ? "★ " : ""}${esc(it.set)}</button>`;
          }).join("")}</div>
        </details>`;
      }).join("");

      const stations = allStationNames();
      host.innerHTML = `
        <div class="fdx-card">
          <div class="hm-h"><h2>Where are today's spotted trainsets?</h2><span class="fdx-meta">${tracked.filter(x => x.status === "live").length} live</span></div>
          ${trackedHTML}
          <div class="fdx-watch-bar">
            <label><span>Approach alert station</span>
              <select id="fdxWatchSt">
                <option value="">Off (pick a station)</option>
                ${stations.map(st => `<option value="${esc(st)}"${st === watchSt ? " selected" : ""}>${esc(st)}</option>`).join("")}
              </select>
            </label>
            <small>Alerts you when any ★ watched trainset on a tracked duty is within 5 min of this station.</small>
          </div>
        </div>

        <div class="fdx-card">
          <div class="hm-h"><h2>Fleet Dex · ${esc(prog.title)}</h2><span class="fdx-meta">${prog.spottedSets}/${prog.totalSets} (${prog.pct}%)</span></div>
          <div class="fdx-groups">${groupsHTML}</div>
          <div class="fdx-bar"><div style="width:${prog.pct}%;background:${prog.color}"></div></div>
          <div class="fdx-legend">
            <span><i class="dot spot"></i>Spotted (${prog.spottedSets})</span>
            <span><i class="dot rode"></i>Rode (${prog.rodeSets})</span>
            <span><i class="dot watch"></i>★ Watched (${watchList.length})</span>
            <label class="fdx-toggle"><input type="checkbox" id="fdxMissingOnly"${showMissingOnly ? " checked" : ""}> Missing only</label>
          </div>
          <p class="fdx-tip">Tap any set number to ★ Watch or unwatch it for approach alerts.</p>
          <div class="fdx-models">${modelsHTML}</div>
        </div>`;
    }

    // Delegate interactions inside #spotRoot
    const spotRoot = document.getElementById("spotRoot");
    spotRoot.addEventListener("click", e => {
      const grp = e.target.closest("[data-fdx-grp]");
      if (grp) {
        activeGroup = grp.dataset.fdxGrp;
        renderSection();
        return;
      }
      const wBtn = e.target.closest("[data-fdx-watch]");
      if (wBtn) {
        toggleWatch(wBtn.dataset.fdxWatch);
        return;
      }
      const jBtn = e.target.closest("[data-fdx-jump-line]");
      if (jBtn) {
        const line = jBtn.dataset.fdxJumpLine;
        const id = jBtn.dataset.fdxJumpId;
        try {
          showView("map");
          if (typeof window.focusTrainOnMap === "function") window.focusTrainOnMap(line, id);
          else if (typeof openTrain === "function") openTrain(line, id);
        } catch (_) {}
      }
    });

    spotRoot.addEventListener("change", e => {
      if (e.target && e.target.id === "fdxWatchSt") {
        store.set(HOME_ST_KEY, e.target.value || "");
        checkApproachingWatched();
      } else if (e.target && e.target.id === "fdxMissingOnly") {
        showMissingOnly = !!e.target.checked;
        renderSection();
      }
    });

    // Re-attach Fleet Dex whenever Spotter's Log re-renders (#spotRoot gets replaced by setHTML)
    const mo = new MutationObserver(() => {
      if (!document.getElementById("mrtFleetDexHost") && spotRoot.children.length) {
        renderSection();
      }
    });
    mo.observe(spotRoot, { childList: true });
    if (spotRoot.children.length) renderSection();

    // Watched-set approach monitor (runs every 45s)
    function checkApproachingWatched() {
      const st = getWatchStation();
      const watchList = getWatch();
      if (!st || !watchList.length) return;
      const now = sgNow();
      const spots = window.spotLog ? window.spotLog() : [];
      const tracked = projectTrackedDuties({ spots, iso: now.iso, nowMins: now.mins });
      const hits = findApproachingWatchedSets(tracked, watchList, st, 5);
      if (!hits.length) return;

      const alerted = store.get(ALERTED_KEY, {}) || {};
      let changed = false;
      for (const h of hits) {
        const key = `${now.iso}|${h.set}|${h.slot}|${h.stationCode}`;
        if (alerted[key]) continue;
        alerted[key] = Date.now();
        changed = true;
        const title = `★ ${h.set} approaching ${h.stationName}`;
        const body = `${h.line === "CG" ? "CGL" : h.line} run T${h.slot.padStart(3, "0")} arrives in ~${h.etaMin} min (${h.clock}).`;
        try {
          if (window.MrtApp && typeof window.MrtApp.spotNotify === "function") {
            window.MrtApp.spotNotify(title, body);
          } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(title, { body, icon: "icons/icon-192.png", tag: "mrt-watch-" + h.set });
          }
        } catch (_) {}
        showWatchToast(title, body, h.line);
      }
      if (changed) {
        for (const k of Object.keys(alerted)) {
          if (!k.startsWith(now.iso)) delete alerted[k];
        }
        store.set(ALERTED_KEY, alerted);
      }
    }

    function showWatchToast(title, body, line) {
      let host = document.getElementById("fdxToast");
      if (!host) {
        host = document.createElement("div");
        host.id = "fdxToast";
        host.className = "fdx-toast";
        host.setAttribute("role", "status");
        document.body.appendChild(host);
      }
      host.style.setProperty("--c", `var(--${line}, var(--fg))`);
      host.hidden = false;
      host.innerHTML = `<div><b>${esc(title)}</b><small>${esc(body)}</small></div><button type="button" aria-label="Dismiss">×</button>`;
      host.querySelector("button").onclick = () => { host.hidden = true; };
      setTimeout(() => { if (host) host.hidden = true; }, 12000);
    }

    setInterval(checkApproachingWatched, 45000);
    setTimeout(checkApproachingWatched, 5000);
  }

  function injectStyles() {
    if (document.getElementById("mrt-fleet-dex-css")) return;
    const style = document.createElement("style");
    style.id = "mrt-fleet-dex-css";
    style.textContent = `
.fdx-root{display:grid;gap:14px;margin-top:16px}
.fdx-card{background:var(--panel);border:1px solid var(--rule);border-radius:16px;padding:14px;display:grid;gap:10px}
.fdx-meta{font:700 12px var(--mono);color:var(--muted)}
.fdx-duty-list{display:grid;gap:8px}
.fdx-duty{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:11px;border:1px solid var(--rule);border-left:4px solid var(--c,var(--fg));background:var(--bg)}
.fdx-duty.is-live{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--good) 40%,transparent)}
.fdx-duty-main{min-width:0;display:grid;gap:3px}
.fdx-duty-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px}
.fdx-chip{font:700 10.5px var(--mono);padding:2px 6px;border-radius:5px;background:var(--c,var(--fg));color:#fff}
.fdx-slot{font:600 11px var(--mono);color:var(--muted)}
.fdx-star{font:700 11px var(--body);color:var(--warn)}
.fdx-loc{margin:0;font-size:12.5px;color:var(--fg)}
.fdx-duty small,.fdx-empty,.fdx-tip{margin:0;font-size:11.5px;color:var(--muted)}
.fdx-jump{border:1px solid var(--rule);background:var(--fg);color:var(--bg);border-radius:8px;padding:6px 10px;font:700 12px var(--body);cursor:pointer;white-space:nowrap}
.fdx-watch-bar{padding-top:8px;border-top:1px solid var(--rule);display:grid;gap:5px}
.fdx-watch-bar label{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12.5px;font-weight:600}
.fdx-watch-bar select{max-width:220px;padding:6px 8px;border-radius:8px;border:1px solid var(--rule);background:var(--bg);color:var(--fg);font:500 12.5px var(--body)}
.fdx-watch-bar small{font-size:11.5px;color:var(--muted)}
.fdx-groups{display:flex;gap:5px;flex-wrap:wrap}
.fdx-groups button{border:1px solid var(--rule);background:var(--bg);color:var(--fg);padding:5px 9px;border-radius:8px;font:700 11.5px var(--mono);cursor:pointer}
.fdx-groups button[aria-selected="true"]{background:var(--c,var(--fg));color:#fff;border-color:var(--c,var(--fg))}
.fdx-bar{height:8px;border-radius:999px;background:var(--soft);overflow:hidden}
.fdx-bar>div{height:100%;border-radius:999px;transition:width .25s ease}
.fdx-legend{display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:11.5px;color:var(--muted)}
.fdx-legend .dot{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:4px;vertical-align:middle}
.fdx-legend .dot.spot{background:var(--good)}
.fdx-legend .dot.rode{background:var(--fg)}
.fdx-legend .dot.watch{background:var(--warn)}
.fdx-toggle{margin-left:auto;display:inline-flex;align-items:center;gap:5px;cursor:pointer;color:var(--fg);font-weight:600}
.fdx-models{display:grid;gap:8px}
.fdx-model{border:1px solid var(--rule);border-radius:11px;background:var(--bg);padding:8px 10px}
.fdx-model summary{display:flex;justify-content:space-between;align-items:center;gap:8px;cursor:pointer;list-style:none;font-size:13px}
.fdx-model summary small{color:var(--muted);font-weight:400;font-size:11.5px}
.fdx-mstat{font:700 11.5px var(--mono);color:var(--muted);white-space:nowrap}
.fdx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:4px;margin-top:8px}
.fdx-cell{border:1px solid var(--rule);background:var(--panel);color:var(--muted);border-radius:6px;padding:4px 3px;font:600 10.5px var(--mono);cursor:pointer;text-align:center}
.fdx-cell.is-spot{background:var(--goodbg);color:var(--good);border-color:color-mix(in srgb,var(--good) 45%,transparent);font-weight:700}
.fdx-cell.is-rode{background:var(--fg);color:var(--bg);border-color:var(--fg);font-weight:700}
.fdx-cell.is-watch{box-shadow:0 0 0 1.5px var(--warn)}
.fdx-toast{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:9800;width:min(420px,calc(100vw - 24px));background:var(--panel);color:var(--fg);border:1px solid var(--rule);border-left:5px solid var(--c,var(--fg));border-radius:12px;box-shadow:var(--shadow);padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.fdx-toast b{display:block;font-size:13px}
.fdx-toast small{display:block;font-size:11.5px;color:var(--muted)}
.fdx-toast button{border:0;background:none;color:var(--muted);font-size:18px;cursor:pointer}
`;
    document.head.appendChild(style);
  }
})();

/* MRT Spotter – Timetable Insights, Depot & Special Runs, Headway Explorer,
   Last-Train Rescue Calculator, and Live GTFS-RT Affected Trains Drawer.
   Pure analysis helpers are exposed on window.mrtInsights for direct unit testing. */
(() => {
  "use strict";

  const W = typeof window !== "undefined" ? window : globalThis;
  if (W.__mrtInsightsLoaded) return;
  W.__mrtInsightsLoaded = true;

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  const pad = n => String(Math.floor(n)).padStart(2, "0");

  function fmtSec(sec) {
    if (!Number.isFinite(sec)) return "--:--";
    const m = Math.round(sec / 60) % 1440;
    const mm = ((m % 1440) + 1440) % 1440;
    return `${pad(mm / 60)}:${pad(mm % 60)}`;
  }

  function fmtMins(mins) {
    if (!Number.isFinite(mins)) return "--:--";
    const total = ((Math.round(mins) % 1440) + 1440) % 1440;
    return `${pad(total / 60)}:${pad(total % 60)}`;
  }

  function lineTag(code) {
    return code === "CG" ? "CGL" : String(code || "");
  }

  function ymdToIso(ymd) {
    const s = String(ymd || "");
    return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
  }

  function isoToYmd(iso) {
    return String(iso || "").replace(/-/g, "");
  }

  function addDaysIso(iso, delta) {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  }

  function serviceIdsForDate(tt, iso, phDays) {
    const active = new Set();
    if (!tt || !Array.isArray(tt.services)) return active;
    const ymd = isoToYmd(iso);
    const d = new Date(`${iso}T00:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
    const isPh = !!(phDays && phDays[iso]);
    const effDow = isPh ? 6 : dow;

    tt.services.forEach((svc, idx) => {
      const mask = String(svc[1] || "");
      const start = String(svc[2] || "");
      const end = String(svc[3] || "");
      if (ymd >= start && ymd <= end && mask[effDow] === "1") {
        active.add(idx);
      }
    });

    const ex = tt.except && tt.except[ymd];
    if (Array.isArray(ex)) {
      for (const [idx, typ] of ex) {
        if (typ === 1) active.add(idx);
        else if (typ === 2) active.delete(idx);
      }
    }
    return active;
  }

  function slotFromTid(tid) {
    const m = /_(\d+)_\d+$/.exec(String(tid || ""));
    return m ? m[1].replace(/^0+/, "") || "0" : "";
  }

  function getLineTripsForDate(tt, code, iso, phDays) {
    const ln = tt && tt.lines && tt.lines[code];
    if (!ln || !Array.isArray(ln.trips) || !Array.isArray(ln.pats)) return [];
    const svcs = serviceIdsForDate(tt, iso, phDays);
    const out = [];
    for (const tr of ln.trips) {
      const [startSec, patIdx, svcIdx, tid] = tr;
      if (!svcs.has(svcIdx)) continue;
      const p = ln.pats[patIdx];
      if (!p) continue;
      const firstIdx = p[0];
      const step = p[1];
      const arr = p[2] || [];
      const dep = p[3] || [];
      const stops = arr.length;
      if (stops < 2) continue;
      const lastIdx = firstIdx + step * (stops - 1);
      const endSec = startSec + (arr[stops - 1] || 0);
      out.push({
        startSec,
        endSec,
        patIdx,
        svcIdx,
        tid: tid || "",
        slot: slotFromTid(tid),
        firstIdx,
        lastIdx,
        step,
        dir: step > 0 ? 0 : 1,
        stops,
        arr,
        dep
      });
    }
    out.sort((a, b) => a.startSec - b.startSec);
    return out;
  }

  /**
   * 1. Depot Pull-Out / Pull-In & Special-Bound Finder
   * Scans packed GTFS trips on `code` for `iso` and classifies every trip that
   * starts mid-line (depot pull-out / short-start) or ends mid-line (depot pull-in / special-bound).
   */
  function analyzeDepotAndSpecialRuns(tt, linesMap, code, iso, phDays) {
    const L = linesMap && linesMap[code];
    const stations = L && Array.isArray(L.stations) ? L.stations : [];
    const trips = getLineTripsForDate(tt, code, iso, phDays);
    const res = {
      code,
      iso,
      totalTrips: trips.length,
      pullOuts: [],
      pullIns: [],
      special: [],
      all: []
    };
    if (!stations.length || !trips.length) return res;

    // Determine the standard termini (min & max station indices reached in today's schedule)
    let minIdx = Infinity;
    let maxIdx = -Infinity;
    for (const tr of trips) {
      if (tr.firstIdx < minIdx) minIdx = tr.firstIdx;
      if (tr.lastIdx < minIdx) minIdx = tr.lastIdx;
      if (tr.firstIdx > maxIdx) maxIdx = tr.firstIdx;
      if (tr.lastIdx > maxIdx) maxIdx = tr.lastIdx;
    }
    const isLoop = !!(L && (L.loop || L.bound));

    for (const tr of trips) {
      const expectedStart = tr.dir === 0 ? minIdx : maxIdx;
      const expectedEnd = tr.dir === 0 ? maxIdx : minIdx;

      const shortStart = !isLoop && tr.firstIdx !== expectedStart;
      const shortEnd = !isLoop
        ? tr.lastIdx !== expectedEnd
        : (tr.stops < Math.max(4, Math.floor((maxIdx - minIdx) * 0.6)));

      if (!shortStart && !shortEnd) continue;

      const fromSt = stations[tr.firstIdx] || [String(tr.firstIdx), `Stop ${tr.firstIdx}`];
      const toSt = stations[tr.lastIdx] || [String(tr.lastIdx), `Stop ${tr.lastIdx}`];

      let kind = "special";
      let badge = "Special-bound";
      if (shortStart && !shortEnd) {
        kind = "pullOut";
        badge = "Depot pull-out / short-start";
      } else if (!shortStart && shortEnd) {
        kind = "pullIn";
        badge = "Depot pull-in / short-turn";
      } else if (shortStart && shortEnd) {
        kind = "special";
        badge = "Short working";
      }

      const row = {
        code,
        tid: tr.tid,
        slot: tr.slot,
        dir: tr.dir,
        startSec: tr.startSec,
        endSec: tr.endSec,
        startClock: fmtSec(tr.startSec),
        endClock: fmtSec(tr.endSec),
        fromCode: fromSt[0],
        fromName: fromSt[1],
        toCode: toSt[0],
        toName: toSt[1],
        stops: tr.stops,
        kind,
        badge
      };

      res.all.push(row);
      if (kind === "pullOut") res.pullOuts.push(row);
      else if (kind === "pullIn") res.pullIns.push(row);
      else res.special.push(row);
    }

    return res;
  }

  /**
   * 2. Line Headway & Timetable Explorer
   * Calculates hourly departure counts, average per-direction headways, and simultaneous active trains.
   */
  function analyzeLineHeadways(tt, linesMap, code, iso, phDays) {
    const trips = getLineTripsForDate(tt, code, iso, phDays);
    const hours = [];
    const runSet = new Set();
    for (const tr of trips) if (tr.slot) runSet.add(tr.slot);

    let peakActive = 0;
    let peakHour = 8;

    for (let h = 5; h <= 24; h++) {
      const hStart = h * 3600;
      const hEnd = (h + 1) * 3600;
      let dir0 = 0;
      let dir1 = 0;
      let active = 0;
      const probes = [hStart + 600, hStart + 1500, hStart + 2400, hStart + 3300];
      const probeCounts = [0, 0, 0, 0];

      for (const tr of trips) {
        if (tr.startSec >= hStart && tr.startSec < hEnd) {
          if (tr.dir === 0) dir0++;
          else dir1++;
        }
        for (let pi = 0; pi < probes.length; pi++) {
          if (tr.startSec <= probes[pi] && tr.endSec >= probes[pi]) probeCounts[pi]++;
        }
      }
      active = Math.max(...probeCounts);

      const perDir = Math.max(dir0, dir1);
      const headwayMin = perDir > 0 ? Math.round((60 / perDir) * 10) / 10 : null;
      if (active > peakActive) {
        peakActive = active;
        peakHour = h;
      }

      hours.push({
        hour: h,
        label: `${pad(h % 24)}:00`,
        departures: dir0 + dir1,
        dir0,
        dir1,
        headwayMin,
        activeTrains: active
      });
    }

    const avgHeadway = (fromH, toH) => {
      const vals = hours.filter(x => x.hour >= fromH && x.hour <= toH && x.headwayMin != null).map(x => x.headwayMin);
      if (!vals.length) return null;
      return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    };

    return {
      code,
      iso,
      totalTrips: trips.length,
      totalRuns: runSet.size,
      peakActive,
      peakHour,
      periods: {
        amPeak: avgHeadway(7, 8),
        midday: avgHeadway(11, 14),
        pmPeak: avgHeadway(17, 19),
        late: avgHeadway(22, 23)
      },
      hours
    };
  }

  /**
   * Detect upcoming GTFS service calendar switches on a line (e.g. DTL 2 Dec 2026 schedule change).
   */
  function detectScheduleChanges(tt, code, fromIso) {
    const ln = tt && tt.lines && tt.lines[code];
    if (!ln || !Array.isArray(tt.services)) return [];
    const used = new Set(ln.trips.map(t => t[2]));
    const svcs = tt.services
      .map((s, idx) => ({ idx, id: String(s[0] || ""), mask: String(s[1] || ""), start: String(s[2] || ""), end: String(s[3] || "") }))
      .filter(s => used.has(s.idx));

    const fromYmd = isoToYmd(fromIso || "2026-01-01");
    const changes = [];
    const seen = new Set();

    for (const a of svcs) {
      for (const b of svcs) {
        if (a.idx === b.idx || a.mask !== b.mask) continue;
        if (b.start > a.end && b.start >= fromYmd) {
          const dayAfterEnd = isoToYmd(addDaysIso(ymdToIso(a.end), 1));
          if (b.start === dayAfterEnd) {
            const key = `${a.idx}->${b.idx}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const tripsA = ln.trips.filter(t => t[2] === a.idx);
            const tripsB = ln.trips.filter(t => t[2] === b.idx);
            const runsA = new Set(tripsA.map(t => slotFromTid(t[3])).filter(Boolean)).size;
            const runsB = new Set(tripsB.map(t => slotFromTid(t[3])).filter(Boolean)).size;
            changes.push({
              code,
              effectiveDate: ymdToIso(b.start),
              oldService: a.id,
              newService: b.id,
              oldTrips: tripsA.length,
              newTrips: tripsB.length,
              oldRuns: runsA,
              newRuns: runsB,
              tripDelta: tripsB.length - tripsA.length,
              runDelta: runsB - runsA
            });
          }
        }
      }
    }

    changes.sort((x, y) => x.effectiveDate.localeCompare(y.effectiveDate));
    return changes;
  }

  /**
   * 3. Last-Train Rescue Calculator ("Can I still make it home?")
   * Evaluates each rail leg's boarding time against the exact last train of the day
   * from packed GTFS (or provided lookup) + live GTFS-RT delay margin.
   */
  function lastDepartureFromStation(tt, linesMap, code, fromCode, toCode, iso, phDays) {
    const L = linesMap && linesMap[code];
    const stations = L && Array.isArray(L.stations) ? L.stations : [];
    const fromIdx = stations.findIndex(s => s[0] === fromCode || s[1] === fromCode);
    const toIdx = stations.findIndex(s => s[0] === toCode || s[1] === toCode);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return null;

    const dir = toIdx > fromIdx ? 0 : 1;
    const trips = getLineTripsForDate(tt, code, iso, phDays);
    let bestMin = null;
    let bestTid = "";

    for (const tr of trips) {
      if (tr.dir !== dir) continue;
      const kFrom = (fromIdx - tr.firstIdx) * tr.step;
      const kTo = (toIdx - tr.firstIdx) * tr.step;
      if (kFrom < 0 || kFrom >= tr.stops || kTo <= kFrom || kTo >= tr.stops) continue;
      const depSec = tr.startSec + (tr.dep[kFrom] != null ? tr.dep[kFrom] : tr.arr[kFrom] || 0);
      const depMin = depSec / 60;
      if (bestMin == null || depMin > bestMin) {
        bestMin = depMin;
        bestTid = tr.tid;
      }
    }
    return bestMin == null ? null : { depMin: bestMin, tid: bestTid, dir };
  }

  function evaluateLastTrainRescue(route, opts) {
    if (!route || !Array.isArray(route.legs)) return null;
    const options = opts || {};
    const tt = options.tt || (typeof TT !== "undefined" ? TT : null);
    const linesMap = options.lines || (typeof LINES !== "undefined" ? LINES : null);
    const iso = options.iso || (typeof sgNow === "function" ? sgNow().iso : "2026-11-25");
    const phDays = options.phDays || (typeof PH_DAYS !== "undefined" ? PH_DAYS : null);
    const nowMins = typeof options.nowMins === "number" ? options.nowMins : (typeof sgNow === "function" ? sgNow().mins : 0);
    const rtDelayByLine = options.rtDelayByLine || {};
    const lookupLast = options.lastDepOf || ((code, fromCode, toCode) =>
      lastDepartureFromStation(tt, linesMap, code, fromCode, toCode, iso, phDays)
    );

    const railLegs = route.legs.filter(l => l && l.line);
    if (!railLegs.length) return null;

    const legs = [];
    let minMargin = Infinity;
    let limitingLeg = null;
    let anyMissed = false;
    let latestOriginCutoff = null;

    // Accumulate travel offset from origin departure so we can back-calculate the latest safe origin departure
    const firstBoard = typeof railLegs[0].board === "number" ? railLegs[0].board : nowMins;

    for (let i = 0; i < railLegs.length; i++) {
      const leg = railLegs[i];
      const lastInfo = lookupLast(leg.line, leg.fromCode || leg.from, leg.toCode || leg.to);
      const rtDelay = Math.max(0, Number(rtDelayByLine[leg.line]) || 0);
      const plannedBoard = typeof leg.board === "number" ? leg.board : null;
      const offsetFromFirst = plannedBoard != null ? Math.max(0, plannedBoard - firstBoard) : 0;

      if (!lastInfo) {
        legs.push({
          legIndex: i,
          line: leg.line,
          from: leg.from,
          to: leg.to,
          plannedBoard,
          lastDepMin: null,
          rtDelay,
          marginMin: null,
          status: leg.wait == null ? "missed" : "unknown"
        });
        if (leg.wait == null) anyMissed = true;
        continue;
      }

      const effectiveBoard = plannedBoard != null ? plannedBoard + rtDelay : null;
      const marginMin = effectiveBoard != null ? Math.round((lastInfo.depMin - effectiveBoard) * 10) / 10 : -1;
      const missed = leg.wait == null || marginMin < 0;
      if (missed) anyMissed = true;

      const status = missed ? "missed" : marginMin < 5 ? "tight" : "safe";
      const legCutoff = lastInfo.depMin - offsetFromFirst - rtDelay;
      if (latestOriginCutoff == null || legCutoff < latestOriginCutoff) {
        latestOriginCutoff = legCutoff;
      }
      if (marginMin < minMargin) {
        minMargin = marginMin;
        limitingLeg = { line: leg.line, from: leg.from, to: leg.to, lastDepMin: lastInfo.depMin, marginMin };
      }

      legs.push({
        legIndex: i,
        line: leg.line,
        from: leg.from,
        to: leg.to,
        plannedBoard,
        lastDepMin: lastInfo.depMin,
        lastClock: fmtMins(lastInfo.depMin),
        rtDelay,
        marginMin,
        status
      });
    }

    const overall = anyMissed ? "missed" : minMargin < 5 ? "tight" : "safe";
    return {
      from: route.from,
      to: route.to,
      overall,
      minMargin: Number.isFinite(minMargin) ? minMargin : null,
      limitingLeg,
      latestOriginCutoff,
      latestOriginClock: latestOriginCutoff != null ? fmtMins(latestOriginCutoff) : "--:--",
      minutesUntilCutoff: latestOriginCutoff != null ? Math.round(latestOriginCutoff - nowMins) : null,
      legs
    };
  }

  /**
   * 4. Collect all active GTFS-RT Affected Trains across the network.
   */
  function collectAffectedTrains(opts) {
    const options = opts || {};
    const state = options.rtState !== undefined ? options.rtState : (typeof rtState !== "undefined" ? rtState : null);
    const linesMap = options.lines || (typeof LINES !== "undefined" ? LINES : null);
    const nowMs = options.nowMs || Date.now();
    if (!state || !state.trips) return [];
    const fresh = !!(state.at && nowMs - state.at <= 10 * 60e3);
    if (!fresh && !options.allowStale) return [];

    const items = [];
    for (const [tid, u] of Object.entries(state.trips)) {
      if (!u) continue;
      const delayMin = Number.isFinite(u.d) ? Math.round((u.d / 60) * 10) / 10 : 0;
      const cancelled = !!u.x;
      const added = !!u.add;
      const skipped = Array.isArray(u.s) ? u.s.filter(q => q[4] === 1) : [];
      const shortTurn = skipped.length > 0;
      const hasVehicle = !!(u.vehicle && (u.vehicle.id || u.vehicle.label || u.vehicle.plate));

      if (!cancelled && !added && !shortTurn && Math.abs(delayMin) < 1 && !hasVehicle) continue;

      const routeRaw = String(u.route || tid.split("_")[0] || "").toUpperCase();
      const line = linesMap && linesMap[routeRaw] ? routeRaw
        : routeRaw === "CGL" ? "CG"
        : routeRaw === "BPLRT" ? "BP"
        : routeRaw;

      let kind = "delay";
      let severity = 1;
      let label = `${delayMin > 0 ? "+" : ""}${Math.round(delayMin)} min`;
      if (cancelled) { kind = "cancelled"; severity = 4; label = "Cancelled"; }
      else if (shortTurn) { kind = "short"; severity = 3; label = `Ends early (${skipped.length} skipped)`; }
      else if (added) { kind = "added"; severity = 2; label = "Extra train"; }
      else if (delayMin >= 5) { severity = 3; }
      else if (Math.abs(delayMin) < 1 && hasVehicle) { kind = "vehicle"; severity = 0; label = "Live vehicle"; }

      items.push({
        tid,
        slot: slotFromTid(tid),
        line,
        kind,
        severity,
        label,
        delayMin,
        cancelled,
        added,
        shortTurn,
        skippedCount: skipped.length,
        vehicle: u.vehicle || null
      });
    }

    items.sort((a, b) => b.severity - a.severity || Math.abs(b.delayMin) - Math.abs(a.delayMin) || a.line.localeCompare(b.line));
    return items;
  }

  /* Expose pure logic immediately for unit tests & other modules */
  const api = {
    analyzeDepotAndSpecialRuns,
    analyzeLineHeadways,
    detectScheduleChanges,
    evaluateLastTrainRescue,
    lastDepartureFromStation,
    collectAffectedTrains,
    fmtSec,
    fmtMins
  };
  W.mrtInsights = api;

  /* ---------------- Browser Runtime & UI ---------------- */
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const ready = () => {
    try {
      return typeof sgNow === "function" && typeof LINES === "object" && typeof ORDER !== "undefined" && typeof showView === "function";
    } catch (_) {
      return false;
    }
  };

  let tries = 0;
  (function wait() {
    if (ready()) {
      try { initUI(); } catch (err) { try { console.warn("mrt-insights.js", err); } catch (_) {} }
    } else if (++tries < 250) {
      setTimeout(wait, 200);
    }
  })();

  function initUI() {
    if (W.__mrtInsightsUIReady) return;
    W.__mrtInsightsUIReady = true;

    injectStyles();

    const ui = {
      tab: "live", // live | depot | headway | rescue
      line: "NSL",
      depotFilter: "all", // all | pullOut | pullIn | special
      open: false
    };

    // 1. Add Home tile + Map Affected Trains button + Line Board quick button
    const homeTools = document.getElementById("homeTools");
    if (homeTools && !document.getElementById("hmInsights")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "hmInsights";
      btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16"/><path d="M7 15v-4"/><path d="M12 15V7"/><path d="M17 15v-6"/></svg>Timetable &amp; live<span>Depot runs · headways · last train</span>`;
      btn.onclick = () => openModal("depot");
      homeTools.appendChild(btn);
    }

    const mapStack = document.getElementById("mapStack");
    let mapBtn = document.getElementById("mapRtAffected");
    if (mapStack && !mapBtn) {
      mapBtn = document.createElement("button");
      mapBtn.type = "button";
      mapBtn.id = "mapRtAffected";
      mapBtn.className = "mi-rt-pill";
      mapBtn.hidden = true;
      mapBtn.onclick = () => openModal("live");
      mapStack.appendChild(mapBtn);
    }

    // Add a quick "Depot runs & headways" button inside Line Board (#fleet container sibling)
    const fleetEl = document.getElementById("fleet");
    if (fleetEl && !document.getElementById("lbInsightsBar")) {
      const bar = document.createElement("div");
      bar.id = "lbInsightsBar";
      bar.className = "ins-lb-bar";
      bar.innerHTML = `<button type="button" class="ins-lb-btn" data-ins-lb="depot">Depot &amp; special runs</button><button type="button" class="ins-lb-btn" data-ins-lb="headway">Headways &amp; frequency</button><button type="button" class="ins-lb-btn" data-ins-lb="live">Live feed changes</button>`;
      bar.addEventListener("click", e => {
        const b = e.target.closest("[data-ins-lb]");
        if (!b) return;
        const activeLine = typeof current !== "undefined" && LINES[current] ? current : ui.line;
        ui.line = activeLine;
        openModal(b.dataset.insLb);
      });
      fleetEl.insertAdjacentElement("afterend", bar);
    }

    // 2. Wrap window.tripSmart to inject compact Last-Train Rescue strip into Trip Planner
    const prevTripSmart = typeof window.tripSmart === "function" ? window.tripSmart : null;
    window.tripSmart = r => {
      const base = prevTripSmart ? prevTripSmart(r) : "";
      if (!r || !r.legs || !r.legs.length) return base;
      const now = sgNow();
      const rtDelayByLine = {};
      try {
        for (const it of collectAffectedTrains()) {
          if (it.delayMin > 0) rtDelayByLine[it.line] = Math.max(rtDelayByLine[it.line] || 0, it.delayMin);
        }
      } catch (_) {}
      const rescue = evaluateLastTrainRescue(r, { nowMins: now.mins, iso: now.iso, rtDelayByLine });
      if (!rescue) return base;

      const isLate = now.mins >= 21.5 * 60 || now.mins < 120;
      const showDetail = isLate || rescue.overall !== "safe";
      const badgeText = rescue.overall === "missed"
        ? "Last connection missed"
        : rescue.overall === "tight"
          ? `Tight last-train margin (${Math.max(0, Math.round(rescue.minMargin))} min)`
          : `Last train safe · depart by ${rescue.latestOriginClock}`;

      const rescueHTML = `<div class="ins-rescue-strip is-${rescue.overall}">
        <div class="ins-rescue-top">
          <span><b>Last-train rescue</b> · ${esc(badgeText)}</span>
          <button type="button" class="ins-rescue-more" data-ins-open="rescue">Details ›</button>
        </div>
        ${showDetail && rescue.limitingLeg ? `<small>Tightest leg: ${esc(lineTag(rescue.limitingLeg.line))} from ${esc(rescue.limitingLeg.from)} (last train ${esc(fmtMins(rescue.limitingLeg.lastDepMin))})</small>` : ""}
      </div>`;
      return base + rescueHTML;
    };

    const mapInfoEl = document.getElementById("mapInfo");
    if (mapInfoEl) {
      mapInfoEl.addEventListener("click", e => {
        const b = e.target.closest("[data-ins-open]");
        if (b) openModal(b.dataset.insOpen);
      });
    }

    // 3. Create modal shell
    const mask = document.createElement("div");
    mask.id = "mrtInsightsMask";
    mask.hidden = true;
    mask.innerHTML = `<div id="mrtInsights" role="dialog" aria-modal="true" aria-label="Timetable insights and live changes">
      <div class="ins-head">
        <div>
          <h2>Timetable &amp; Live Insights</h2>
          <p class="ins-sub" id="insSub">LTA GTFS timetable &amp; live feed intelligence</p>
        </div>
        <button type="button" class="ins-close" id="insClose" aria-label="Close">×</button>
      </div>
      <div class="ins-tabs" role="tablist">
        <button type="button" role="tab" data-ins-tab="live">Live changes</button>
        <button type="button" role="tab" data-ins-tab="depot">Depot &amp; special</button>
        <button type="button" role="tab" data-ins-tab="headway">Headways</button>
        <button type="button" role="tab" data-ins-tab="rescue">Last-train rescue</button>
      </div>
      <div class="ins-body" id="insBody"></div>
    </div>`;
    document.body.appendChild(mask);

    mask.addEventListener("click", e => {
      if (e.target === mask || e.target.id === "insClose") {
        closeModal();
        return;
      }
      const tabBtn = e.target.closest("[data-ins-tab]");
      if (tabBtn) {
        ui.tab = tabBtn.dataset.insTab;
        renderModal();
        return;
      }
      const lineBtn = e.target.closest("[data-ins-line]");
      if (lineBtn) {
        ui.line = lineBtn.dataset.insLine;
        renderModal();
        return;
      }
      const dfBtn = e.target.closest("[data-ins-df]");
      if (dfBtn) {
        ui.depotFilter = dfBtn.dataset.insDf;
        renderModal();
        return;
      }
      const jumpBtn = e.target.closest("[data-ins-jump]");
      if (jumpBtn) {
        jumpToTrain(jumpBtn.dataset.insJumpLine, jumpBtn.dataset.insJumpSlot, jumpBtn.dataset.insJumpTid);
      }
    });

    function jumpToTrain(line, slot, tid) {
      closeModal();
      try {
        showView("map");
        const now = sgNow();
        const list = typeof mapTrains === "function" ? mapTrains(line, now) : (typeof trainsOn === "function" ? trainsOn(line, now) : []);
        const match = list.find(t =>
          (tid && t.ref && String(t.ref.tid) === tid) ||
          (slot && t.ref && typeof ttSlotOf === "function" && ttSlotOf(t.ref.tid) === slot)
        ) || list[0];
        if (match && typeof window.focusTrainOnMap === "function") {
          window.focusTrainOnMap(line, match.id);
        } else if (match && typeof openTrain === "function") {
          openTrain(line, match.id);
        }
      } catch (_) {}
    }

    function openModal(tab) {
      if (tab) ui.tab = tab;
      if (typeof current !== "undefined" && LINES[current] && typeof TT !== "undefined" && TT && TT.lines && TT.lines[current]) {
        ui.line = current;
      }
      ui.open = true;
      mask.hidden = false;
      renderModal();
    }

    function closeModal() {
      ui.open = false;
      mask.hidden = true;
    }

    function linePickerHTML() {
      const avail = ORDER.filter(c => LINES[c] && typeof TT !== "undefined" && TT && TT.lines && TT.lines[c]);
      if (!avail.length) return "";
      if (!avail.includes(ui.line)) ui.line = avail[0];
      return `<div class="ins-lines">${avail.map(c =>
        `<button type="button" data-ins-line="${esc(c)}" aria-selected="${c === ui.line}" style="--c:var(--${esc(c)})">${esc(lineTag(c))}</button>`
      ).join("")}</div>`;
    }

    function renderLiveTab() {
      const items = collectAffectedTrains();
      const fresh = !!(typeof rtState !== "undefined" && rtState && rtState.at && Date.now() - rtState.at <= 10 * 60e3);
      const hasLive = !!(typeof APP !== "undefined" && APP && APP.gtfsRealtime && typeof hasKey === "function" && hasKey());

      if (!hasLive) {
        return `<div class="ins-empty"><b>Live GTFS-Realtime feed not connected</b><p>Connect the relay (on the website) or add an LTA key (in the Android app) to view live delays, cancellations, early turnbacks, and extra trains here.</p></div>`;
      }
      if (!items.length) {
        return `<div class="ins-empty"><b>All scheduled trains running normally</b><p>${fresh ? "LTA's GTFS-Realtime TripUpdates feed currently reports no delayed, cancelled, short-turned, or extra trains." : "Waiting for the next GTFS-Realtime refresh."} Any live adjustments will appear here and directly on the map.</p></div>`;
      }

      return `<p class="ins-hint">${items.length} active GTFS-Realtime train adjustment${items.length === 1 ? "" : "s"} right now. Tap any row to jump straight to that train on the map.</p>
        <div class="ins-list">${items.map(it => {
          const vehTxt = it.vehicle
            ? [it.vehicle.id, it.vehicle.label !== it.vehicle.id ? it.vehicle.label : "", it.vehicle.plate].filter(Boolean).join(" · ")
            : "";
          return `<button type="button" class="ins-row is-${it.kind}" data-ins-jump="1" data-ins-jump-line="${esc(it.line)}" data-ins-jump-slot="${esc(it.slot)}" data-ins-jump-tid="${esc(it.tid)}" style="--c:var(--${esc(it.line)})">
            <span class="ins-chip">${esc(lineTag(it.line))}</span>
            <div class="ins-row-main">
              <b>${it.slot ? `Run T${esc(it.slot.padStart(3, "0"))}` : esc(it.tid)}</b>
              <small>${esc(it.tid)}${vehTxt ? ` · Vehicle ${esc(vehTxt)}` : ""}</small>
            </div>
            <span class="ins-badge is-${it.kind}">${esc(it.label)}</span>
          </button>`;
        }).join("")}</div>`;
    }

    function renderDepotTab() {
      const tt = typeof TT !== "undefined" ? TT : null;
      if (!tt || !tt.lines) return `<div class="ins-empty"><b>Timetable not loaded yet</b><p>Wait a moment for LTA's GTFS timetable to load.</p></div>`;
      const now = sgNow();
      const data = analyzeDepotAndSpecialRuns(tt, LINES, ui.line, now.iso, typeof PH_DAYS !== "undefined" ? PH_DAYS : null);
      const nowSec = now.mins * 60;
      const list = ui.depotFilter === "all" ? data.all
        : ui.depotFilter === "pullOut" ? data.pullOuts
        : ui.depotFilter === "pullIn" ? data.pullIns
        : data.special;

      const rows = list.slice(0, 120).map(r => {
        const isNow = nowSec >= r.startSec && nowSec <= r.endSec;
        const isSoon = !isNow && r.startSec > nowSec && r.startSec - nowSec <= 45 * 60;
        const stateTag = isNow ? `<span class="ins-tag live">Live now</span>` : isSoon ? `<span class="ins-tag soon">In ${Math.round((r.startSec - nowSec) / 60)}m</span>` : "";
        return `<button type="button" class="ins-row${isNow ? " is-now" : ""}" data-ins-jump="1" data-ins-jump-line="${esc(r.code)}" data-ins-jump-slot="${esc(r.slot)}" data-ins-jump-tid="${esc(r.tid)}" style="--c:var(--${esc(r.code)})">
          <span class="ins-time">${esc(r.startClock)}</span>
          <div class="ins-row-main">
            <b>${esc(r.fromName)} → ${esc(r.toName)} ${stateTag}</b>
            <small>${esc(r.badge)}${r.slot ? ` · Run T${esc(r.slot.padStart(3, "0"))}` : ""} · ${r.stops} stops · arrives ${esc(r.endClock)}</small>
          </div>
          <span class="ins-badge">${esc(r.fromCode)}→${esc(r.toCode)}</span>
        </button>`;
      }).join("");

      return `${linePickerHTML()}
        <div class="ins-stats">
          <div><b>${data.pullOuts.length}</b><span>Pull-outs</span></div>
          <div><b>${data.pullIns.length}</b><span>Pull-ins</span></div>
          <div><b>${data.special.length}</b><span>Short runs</span></div>
          <div><b>${data.totalTrips}</b><span>Total trips</span></div>
        </div>
        <div class="ins-pills">
          <button type="button" data-ins-df="all" aria-pressed="${ui.depotFilter === "all"}">All (${data.all.length})</button>
          <button type="button" data-ins-df="pullOut" aria-pressed="${ui.depotFilter === "pullOut"}">Pull-outs (${data.pullOuts.length})</button>
          <button type="button" data-ins-df="pullIn" aria-pressed="${ui.depotFilter === "pullIn"}">Pull-ins (${data.pullIns.length})</button>
          <button type="button" data-ins-df="special" aria-pressed="${ui.depotFilter === "special"}">Short (${data.special.length})</button>
        </div>
        ${rows ? `<div class="ins-list">${rows}</div>` : `<div class="ins-empty"><b>No matching special runs on ${esc(lineTag(ui.line))} today</b><p>All scheduled trips on this filter run full line length today.</p></div>`}`;
    }

    function renderHeadwayTab() {
      const tt = typeof TT !== "undefined" ? TT : null;
      if (!tt || !tt.lines) return `<div class="ins-empty"><b>Timetable not loaded yet</b></div>`;
      const now = sgNow();
      const hw = analyzeLineHeadways(tt, LINES, ui.line, now.iso, typeof PH_DAYS !== "undefined" ? PH_DAYS : null);
      const changes = detectScheduleChanges(tt, ui.line, now.iso);
      const maxActive = Math.max(1, hw.peakActive);
      const curH = Math.floor(now.mins / 60);

      const bars = hw.hours.map(h => {
        const pct = Math.round((h.activeTrains / maxActive) * 100);
        const isNow = h.hour === curH;
        return `<div class="ins-bar-col${isNow ? " is-now" : ""}" title="${h.label} · ${h.activeTrains} active trains · ${h.headwayMin ? h.headwayMin + " min headway" : "no service"}">
          <div class="ins-bar-val">${h.activeTrains || ""}</div>
          <div class="ins-bar-track"><div class="ins-bar-fill" style="height:${pct}%;background:var(--${esc(ui.line)})"></div></div>
          <div class="ins-bar-lbl">${h.hour % 2 === 1 ? pad(h.hour % 24) : ""}</div>
        </div>`;
      }).join("");

      const changeCards = changes.map(ch => `<div class="ins-change">
        <b>Upcoming schedule switch · ${esc(ch.effectiveDate)}</b>
        <p>${esc(ch.oldService)} → ${esc(ch.newService)}: <b>${ch.oldTrips} → ${ch.newTrips} trips</b> (${ch.tripDelta >= 0 ? "+" : ""}${ch.tripDelta})${ch.oldRuns || ch.newRuns ? ` · <b>${ch.oldRuns} → ${ch.newRuns} duties</b> (${ch.runDelta >= 0 ? "+" : ""}${ch.runDelta})` : ""}</p>
      </div>`).join("");

      return `${linePickerHTML()}
        <div class="ins-stats">
          <div><b>${hw.periods.amPeak ? hw.periods.amPeak + "m" : "–"}</b><span>AM peak</span></div>
          <div><b>${hw.periods.midday ? hw.periods.midday + "m" : "–"}</b><span>Off-peak</span></div>
          <div><b>${hw.periods.pmPeak ? hw.periods.pmPeak + "m" : "–"}</b><span>PM peak</span></div>
          <div><b>${hw.peakActive}</b><span>Peak trains</span></div>
        </div>
        <div class="ins-chart-box">
          <div class="ins-chart-head"><b>Simultaneous active trains by hour (${esc(now.iso)})</b><span>${hw.totalTrips} trips · ${hw.totalRuns || "—"} runs</span></div>
          <div class="ins-bars">${bars}</div>
        </div>
        ${changeCards || `<p class="ins-hint">No upcoming service-calendar switches detected on ${esc(lineTag(ui.line))} in the current GTFS feed.</p>`}`;
    }

    function renderRescueTab() {
      const r = typeof window.mrtTripRoute === "function" ? window.mrtTripRoute() : null;
      if (!r) {
        return `<div class="ins-empty"><b>Plan a trip first to check your last-train rescue window</b><p>Open <b>Plan a trip</b> on the Map tab, pick your origin and destination, and this calculator will verify every transfer margin against tonight's exact GTFS last trains and live delays.</p></div>`;
      }
      const now = sgNow();
      const rtDelayByLine = {};
      for (const it of collectAffectedTrains()) {
        if (it.delayMin > 0) rtDelayByLine[it.line] = Math.max(rtDelayByLine[it.line] || 0, it.delayMin);
      }
      const rescue = evaluateLastTrainRescue(r, { nowMins: now.mins, iso: now.iso, rtDelayByLine });
      if (!rescue) return `<div class="ins-empty"><b>No rail legs to calculate</b></div>`;

      const title = rescue.overall === "missed"
        ? "Last train connection missed"
        : rescue.overall === "tight"
          ? `Tight connection — ${Math.max(0, Math.round(rescue.minMargin))} min spare`
          : `You can still make it home`;

      return `<div class="ins-rescue-hero is-${rescue.overall}">
          <b>${esc(rescue.from)} → ${esc(rescue.to)}</b>
          <h3>${esc(title)}</h3>
          <p>Latest safe departure from ${esc(rescue.from)}: <b>${esc(rescue.latestOriginClock)}</b>${rescue.minutesUntilCutoff != null && rescue.minutesUntilCutoff > 0 ? ` (${rescue.minutesUntilCutoff} min from now)` : ""}</p>
        </div>
        <div class="ins-list">${rescue.legs.map(l => `<div class="ins-row is-${l.status}" style="--c:var(--${esc(l.line)})">
          <span class="ins-chip">${esc(lineTag(l.line))}</span>
          <div class="ins-row-main">
            <b>${esc(l.from)} → ${esc(l.to)}</b>
            <small>Planned board ${l.plannedBoard != null ? esc(fmtMins(l.plannedBoard)) : "—"} · Last train ${esc(l.lastClock || "—")}${l.rtDelay ? ` · +${Math.round(l.rtDelay)}m live delay` : ""}</small>
          </div>
          <span class="ins-badge is-${l.status}">${l.status === "missed" ? "Missed" : l.marginMin != null ? `${Math.round(l.marginMin)}m margin` : "—"}</span>
        </div>`).join("")}</div>`;
    }

    function renderModal() {
      if (!ui.open) return;
      mask.querySelectorAll("[data-ins-tab]").forEach(b => {
        b.setAttribute("aria-selected", String(b.dataset.insTab === ui.tab));
      });
      const body = document.getElementById("insBody");
      if (!body) return;
      if (ui.tab === "live") body.innerHTML = renderLiveTab();
      else if (ui.tab === "depot") body.innerHTML = renderDepotTab();
      else if (ui.tab === "headway") body.innerHTML = renderHeadwayTab();
      else body.innerHTML = renderRescueTab();
    }

    // 4. Keep map pill badge synced with live GTFS-RT updates
    function syncLivePill() {
      if (!mapBtn) return;
      const items = collectAffectedTrains();
      if (items.length > 0) {
        const severe = items.some(x => x.cancelled || x.shortTurn || x.delayMin >= 4);
        mapBtn.hidden = false;
        mapBtn.classList.toggle("is-bad", severe);
        mapBtn.textContent = `⚡ ${items.length} live train change${items.length === 1 ? "" : "s"}`;
      } else {
        mapBtn.hidden = true;
      }
      if (ui.open && ui.tab === "live") renderModal();
    }

    setInterval(syncLivePill, 8000);
    setTimeout(syncLivePill, 1500);

    api.open = openModal;
    api.close = closeModal;
  }

  function injectStyles() {
    if (document.getElementById("mrt-insights-css")) return;
    const style = document.createElement("style");
    style.id = "mrt-insights-css";
    style.textContent = `
.mi-rt-pill{display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:999px;border:1px solid var(--warn);background:var(--warnbg);color:var(--fg);font:700 12px var(--body);cursor:pointer;box-shadow:var(--shadow-soft)}
.mi-rt-pill.is-bad{border-color:var(--bad);background:var(--badbg)}
.ins-lb-bar{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px}
.ins-lb-btn{border:1px solid var(--rule);background:var(--panel);color:var(--fg);border-radius:9px;padding:6px 10px;font:600 12px var(--body);cursor:pointer}
.ins-lb-btn:hover{background:var(--soft)}
.ins-rescue-strip{margin:8px 0 4px;padding:9px 11px;border-radius:10px;border:1px solid var(--rule);background:var(--soft);display:grid;gap:3px}
.ins-rescue-strip.is-safe{border-color:color-mix(in srgb,var(--good) 40%,transparent);background:var(--goodbg)}
.ins-rescue-strip.is-tight{border-color:color-mix(in srgb,var(--warn) 50%,transparent);background:var(--warnbg)}
.ins-rescue-strip.is-missed{border-color:color-mix(in srgb,var(--bad) 50%,transparent);background:var(--badbg)}
.ins-rescue-top{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px}
.ins-rescue-strip small{font-size:11.5px;color:var(--muted)}
.ins-rescue-more{border:0;background:none;color:var(--fg);font:700 12px var(--body);cursor:pointer;padding:2px 4px;white-space:nowrap}
#mrtInsightsMask{position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.46);padding:clamp(8px,3vw,24px);overflow:auto;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}
#mrtInsightsMask[hidden]{display:none}
#mrtInsights{max-width:740px;margin:2vh auto;background:var(--panel);color:var(--fg);border:1px solid var(--rule);border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.42);overflow:hidden}
.ins-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 18px;border-bottom:1px solid var(--rule)}
.ins-head h2{margin:0;font:700 20px/1.15 var(--display)}
.ins-sub{margin:2px 0 0;font-size:12px;color:var(--muted)}
.ins-close{width:38px;height:38px;border-radius:11px;border:1px solid var(--rule);background:var(--soft);color:var(--fg);font-size:21px;line-height:1;cursor:pointer}
.ins-tabs{display:flex;gap:4px;padding:8px 14px;border-bottom:1px solid var(--rule);overflow-x:auto;background:var(--bg)}
.ins-tabs button{flex:0 0 auto;border:1px solid var(--rule);background:var(--panel);color:var(--muted);padding:7px 11px;border-radius:9px;font:700 12.5px var(--body);cursor:pointer}
.ins-tabs button[aria-selected="true"]{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.ins-body{padding:14px 16px 20px;display:grid;gap:12px}
.ins-lines{display:flex;gap:5px;flex-wrap:wrap}
.ins-lines button{border:1px solid var(--rule);background:var(--panel);color:var(--fg);padding:5px 9px;border-radius:8px;font:700 11.5px var(--mono);cursor:pointer}
.ins-lines button[aria-selected="true"]{background:var(--c,var(--fg));color:#fff;border-color:var(--c,var(--fg))}
.ins-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.ins-stats>div{background:var(--soft);border:1px solid var(--rule);border-radius:11px;padding:9px 10px;display:grid;gap:2px}
.ins-stats b{font:700 18px/1.1 var(--mono)}
.ins-stats span{font-size:11px;color:var(--muted)}
.ins-pills{display:flex;gap:6px;flex-wrap:wrap}
.ins-pills button{border:1px solid var(--rule);background:var(--panel);color:var(--fg);padding:5px 10px;border-radius:999px;font:600 12px var(--body);cursor:pointer}
.ins-pills button[aria-pressed="true"]{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.ins-list{display:grid;gap:6px;max-height:48vh;overflow:auto}
.ins-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;text-align:left;width:100%;padding:9px 11px;border-radius:11px;border:1px solid var(--rule);border-left:4px solid var(--c,var(--fg));background:var(--bg);color:var(--fg);cursor:pointer}
.ins-row:hover{background:var(--soft)}
.ins-row.is-now{box-shadow:inset 0 0 0 1px var(--good)}
.ins-time,.ins-chip{font:700 12px var(--mono);padding:3px 7px;border-radius:6px;background:var(--c,var(--fg));color:#fff;white-space:nowrap}
.ins-row-main{min-width:0}
.ins-row-main b{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px}
.ins-row-main small{display:block;font-size:11.5px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ins-badge{font:700 11px var(--mono);padding:3px 7px;border-radius:6px;background:var(--soft);color:var(--fg);white-space:nowrap}
.ins-badge.is-cancelled,.ins-badge.is-missed{background:var(--badbg);color:var(--bad)}
.ins-badge.is-short,.ins-badge.is-tight,.ins-badge.is-delay{background:var(--warnbg);color:var(--warn)}
.ins-badge.is-safe,.ins-badge.is-added{background:var(--goodbg);color:var(--good)}
.ins-tag{font:700 10px var(--mono);padding:2px 6px;border-radius:5px;text-transform:uppercase}
.ins-tag.live{background:var(--goodbg);color:var(--good)}
.ins-tag.soon{background:var(--warnbg);color:var(--warn)}
.ins-chart-box{padding:12px;border-radius:12px;border:1px solid var(--rule);background:var(--bg);display:grid;gap:10px}
.ins-chart-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px}
.ins-chart-head span{color:var(--muted);font-family:var(--mono);font-size:11.5px}
.ins-bars{display:grid;grid-template-columns:repeat(20,minmax(0,1fr));gap:3px;align-items:end;height:130px;padding-top:14px}
.ins-bar-col{display:grid;grid-template-rows:14px 1fr 14px;height:100%;align-items:end;text-align:center}
.ins-bar-col.is-now .ins-bar-lbl{color:var(--fg);font-weight:800}
.ins-bar-val{font:600 9.5px var(--mono);color:var(--muted);line-height:1}
.ins-bar-track{height:100%;display:flex;align-items:flex-end;justify-content:center;padding:2px 0}
.ins-bar-fill{width:100%;border-radius:4px 4px 1px 1px;min-height:2px;opacity:.85}
.ins-bar-col.is-now .ins-bar-fill{opacity:1;outline:2px solid var(--fg);outline-offset:1px}
.ins-bar-lbl{font:600 9.5px var(--mono);color:var(--muted)}
.ins-change{padding:10px 12px;border-radius:11px;border:1px solid var(--warn);background:var(--warnbg)}
.ins-change b{display:block;font-size:13px;margin-bottom:3px}
.ins-change p{margin:0;font-size:12px;line-height:1.4}
.ins-rescue-hero{padding:13px 14px;border-radius:12px;border:1px solid var(--rule);background:var(--soft);display:grid;gap:4px}
.ins-rescue-hero.is-safe{background:var(--goodbg);border-color:color-mix(in srgb,var(--good) 40%,transparent)}
.ins-rescue-hero.is-tight{background:var(--warnbg);border-color:color-mix(in srgb,var(--warn) 45%,transparent)}
.ins-rescue-hero.is-missed{background:var(--badbg);border-color:color-mix(in srgb,var(--bad) 45%,transparent)}
.ins-rescue-hero h3{margin:0;font:700 18px var(--display)}
.ins-rescue-hero p{margin:0;font-size:12.5px}
.ins-hint{margin:0;font-size:12px;color:var(--muted)}
.ins-empty{padding:18px 14px;border-radius:12px;border:1px dashed var(--rule);text-align:center;display:grid;gap:4px}
.ins-empty p{margin:0;font-size:12.5px;color:var(--muted)}
@media (max-width:520px){.ins-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
    document.head.appendChild(style);
  }
})();

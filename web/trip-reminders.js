/* MRT Spotter – Trip Reminder System (Web Push + Service Worker + Live Approach Tracker).
   Alerts riders with push notifications as their train approaches each next station, interchange,
   and final destination along a planned route. Works across web browsers (VAPID Web Push +
   Service Worker Notification API + in-app toast fallback) and forwards alarms to the Android
   bridge when running inside the native app. */
(() => {
  "use strict";

  const W = typeof window !== "undefined" ? window : globalThis;
  const STATE_KEY = "mrt.tripReminders.v1";
  const PREFS_KEY = "mrt.tripReminderPrefs.v1";
  const CLIENT_KEY = "mrt.tripReminderClient.v1";

  const DEFAULT_PREFS = {
    mode: "every",    // "every" (every approaching station) | "key" (boarding, transfers & destination)
    leadMin: 1,       // 1 | 2 | 3 minutes advance notice before station arrival
    sound: true
  };

  function safeParse(raw, fallback) {
    try {
      const v = typeof raw === "string" ? JSON.parse(raw) : raw;
      return v == null ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function readStore(key, fallback) {
    try {
      if (typeof store !== "undefined" && store && typeof store.get === "function") {
        return store.get(key, fallback);
      }
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : safeParse(raw, fallback);
      }
    } catch (_) {}
    return fallback;
  }

  function writeStore(key, val) {
    try {
      if (typeof store !== "undefined" && store && typeof store.set === "function") {
        store.set(key, val);
        return;
      }
      if (typeof localStorage !== "undefined") {
        if (val == null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(val));
      }
    } catch (_) {}
  }

  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;"
    }[c]));
  }

  function formatSgtClock(ms) {
    const mins = (((ms + 8 * 3600e3) % 864e5) + 864e5) % 864e5 / 60000;
    const total = Math.round(mins) % 1440;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  function formatCountdown(deltaMs) {
    if (deltaMs <= 15000) return "Now";
    const totalSec = Math.ceil(deltaMs / 1000);
    if (totalSec < 60) return `in ${totalSec}s`;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (mins < 5 && secs >= 10) return `in ${mins}m ${secs}s`;
    return `in ${Math.round(totalSec / 60)} min`;
  }

  function tripKeyOf(route) {
    return route && route.a && route.b ? `${route.a}|${route.b}` : "";
  }

  function lineLabel(code, linesMap) {
    if (code === "CG") return "Changi Airport Branch";
    const L = linesMap && linesMap[code];
    return (L && L.name) || code || "MRT";
  }

  function shortLine(code) {
    return code === "CG" ? "CGL" : String(code || "");
  }

  function stationNameFor(code, nameMap, fallback) {
    if (nameMap && nameMap[code]) return nameMap[code];
    return fallback || code || "Next station";
  }

  /* Compute per-stop cumulative arrival fractions along a rail leg using real map segment
     distances when available (plus a dwell weight per stop), else uniform stop spacing. */
  function stopFractions(leg, mapStations) {
    const ids = Array.isArray(leg.ids) && leg.ids.length >= 2 ? leg.ids : null;
    const stopCount = ids ? ids.length - 1 : Math.max(1, Number(leg.stops) || 1);
    const weights = [];
    let total = 0;

    for (let i = 0; i < stopCount; i++) {
      let w = 1;
      if (ids && mapStations) {
        const a = mapStations[ids[i]];
        const b = mapStations[ids[i + 1]];
        if (a && b && typeof a[0] === "number" && typeof b[0] === "number") {
          const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
          // Blend track distance with fixed station dwell so short hops stay realistic
          w = Math.max(0.45, dist / 1000 + 0.45);
        }
      }
      weights.push(w);
      total += w;
    }

    const fracs = [0];
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      fracs.push(total > 0 ? acc / total : (i + 1) / stopCount);
    }
    return fracs;
  }

  /**
   * Build the full chronological approaching-station reminder plan for a planned route.
   * Pure and deterministic so it can be unit-tested directly without a browser DOM.
   */
  function buildReminderSchedule(route, opts) {
    if (!route || !Array.isArray(route.legs)) return [];
    const options = opts || {};
    const nowMins = typeof options.nowMins === "number" ? options.nowMins : 0;
    const nowMs = typeof options.nowMs === "number" ? options.nowMs : Date.now();
    const mode = options.mode === "key" ? "key" : "every";
    const leadMin = Math.max(1, Math.min(5, Number(options.leadMin) || 1));
    const leadMs = leadMin * 60000;
    const linesMap = options.lines || (typeof LINES !== "undefined" ? LINES : null);
    const nameMap = options.nameOf || (typeof NAME_OF !== "undefined" ? NAME_OF : null);
    const mapStations = options.mapStations || (typeof MAP !== "undefined" && MAP && MAP.stations ? MAP.stations : null);

    const toEpoch = mins => Math.round(nowMs + (mins - nowMins) * 60000);
    const railLegs = route.legs.filter(l => l && l.line);
    const key = tripKeyOf(route);
    const items = [];

    railLegs.forEach((leg, legIdx) => {
      if (leg.wait == null || typeof leg.board !== "number" || typeof leg.arrive !== "number") return;

      const isFirstLeg = legIdx === 0;
      const isLastLeg = legIdx === railLegs.length - 1;
      const nextLeg = railLegs[legIdx + 1] || null;
      const rtLeg = options.rtByLeg && options.rtByLeg[legIdx] ? options.rtByLeg[legIdx] : null;
      const rtDelayMin = rtLeg && Number.isFinite(rtLeg.delayMin) ? rtLeg.delayMin : 0;
      const rtShiftMs = Math.round(rtDelayMin * 60000);
      const boardMs = toEpoch(leg.board) + rtShiftMs;
      const arriveMs = toEpoch(leg.arrive) + rtShiftMs;
      const rideMs = Math.max(30000, arriveMs - boardMs);
      const lName = lineLabel(leg.line, linesMap);
      const towardTxt = leg.toward ? `towards ${leg.toward}` : "";

      // 1. Boarding alert when the train is approaching the boarding platform
      const boardAlertAt = Math.max(nowMs + 5000, boardMs - Math.max(60000, leadMs));
      if (boardMs > nowMs + 15000) {
        const minsAhead = Math.max(1, Math.round((boardMs - boardAlertAt) / 60000));
        items.push({
          id: `${key}|L${legIdx}|board|${leg.fromCode || leg.from}`,
          kind: "board",
          legIndex: legIdx,
          stopIndex: 0,
          totalStopsInLeg: Math.max(1, leg.stops || 1),
          stopsRemaining: Math.max(1, leg.stops || 1),
          line: leg.line,
          stationCode: leg.fromCode || "",
          stationName: leg.from,
          at: boardAlertAt,
          arrivalAt: boardMs,
          title: isFirstLeg
            ? `${shortLine(leg.line)} train approaching ${leg.from}`
            : `Board ${shortLine(leg.line)} at ${leg.from}`,
          body: `${lName}${towardTxt ? " " + towardTxt : ""} arrives in ~${minsAhead} min (${formatSgtClock(boardMs)}).`,
          tag: `mrt-rem-${key}-L${legIdx}-board`
        });
      }

      // 2. Per-station approaching alerts along the leg
      const ids = Array.isArray(leg.ids) && leg.ids.length >= 2
        ? leg.ids
        : [leg.fromCode || leg.from, leg.toCode || leg.to];
      const fracs = stopFractions(leg, mapStations);
      const lastIdx = ids.length - 1;

      for (let s = 1; s <= lastIdx; s++) {
        const isLegEnd = s === lastIdx;
        if (mode === "key" && !isLegEnd) continue;

        const prevStopMs = boardMs + Math.round(rideMs * fracs[s - 1]);
        const stopArrivalMs = boardMs + Math.round(rideMs * fracs[s]);
        if (stopArrivalMs <= nowMs + 10000) continue;

        const segDurationMs = Math.max(25000, stopArrivalMs - prevStopMs);
        // Alert before arriving at the next station: respect user lead time, clamped so it fires
        // after departing the previous stop (at least 35% into the segment, max 60% before arrival).
        const desiredLead = isLegEnd ? leadMs : Math.min(leadMs, 90000);
        const clampedLead = Math.min(desiredLead, Math.round(segDurationMs * 0.65));
        const alertAt = Math.max(nowMs + 5000, prevStopMs + 10000, stopArrivalMs - Math.max(25000, clampedLead));

        const code = ids[s];
        const stName = isLegEnd
          ? (leg.to || stationNameFor(code, nameMap, code))
          : stationNameFor(code, nameMap, code);
        const stopsLeft = lastIdx - s;

        let kind = "station";
        let title = `Approaching ${stName}${code && code !== stName ? ` (${code})` : ""}`;
        let body = `${lName} · next stop at ${formatSgtClock(stopArrivalMs)} · ${stopsLeft} stop${stopsLeft === 1 ? "" : "s"} left to ${leg.to}.`;

        if (isLegEnd && !isLastLeg && nextLeg) {
          kind = "transfer";
          title = `Transfer next: ${stName}${code && code !== stName ? ` (${code})` : ""}`;
          body = `Approaching ${stName} (${formatSgtClock(stopArrivalMs)}). Alight to change to ${lineLabel(nextLeg.line, linesMap)}${nextLeg.toward ? ` towards ${nextLeg.toward}` : ""}.`;
        } else if (isLegEnd && isLastLeg) {
          kind = "destination";
          title = `Approaching destination: ${stName}`;
          body = `Final stop next (${formatSgtClock(stopArrivalMs)}) on ${lName}. Get ready to alight at ${stName}${code && code !== stName ? ` (${code})` : ""}.`;
        }

        items.push({
          id: `${key}|L${legIdx}|S${s}|${code}`,
          kind,
          legIndex: legIdx,
          stopIndex: s,
          totalStopsInLeg: lastIdx,
          stopsRemaining: stopsLeft,
          line: leg.line,
          stationCode: code || "",
          stationName: stName,
          at: alertAt,
          arrivalAt: stopArrivalMs,
          title,
          body,
          tag: `mrt-rem-${key}-L${legIdx}-S${s}`
        });
      }
    });

    items.sort((a, b) => a.at - b.at || a.arrivalAt - b.arrivalAt);
    return items;
  }

  function findNextUpcoming(reminders, nowMs, firedIds) {
    if (!Array.isArray(reminders)) return null;
    const fired = firedIds instanceof Set ? firedIds : new Set(Array.isArray(firedIds) ? firedIds : []);
    for (const item of reminders) {
      if (!fired.has(item.id) && item.arrivalAt > nowMs) return item;
    }
    return null;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const out = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
    return out;
  }

  /**
   * Inspect live GTFS-Realtime TripUpdates for a planned route's rail legs.
   * Returns per-leg advisories (delay >= 2 min, cancelled, or ending early before exit).
   */
  function inspectRouteGtfsRt(route, opts) {
    if (!route || !Array.isArray(route.legs)) return [];
    const options = opts || {};
    const rtStateObj = options.rtState !== undefined ? options.rtState : (typeof rtState !== "undefined" ? rtState : null);
    const linesMap = options.lines || (typeof LINES !== "undefined" ? LINES : null);
    const nowIso = options.iso || (typeof sgNow === "function" ? sgNow().iso : "");
    const getShifts = options.getShifts || (typeof W.rtShifts === "function" ? W.rtShifts : null);
    const getTrains = options.getTrains || (typeof trainsOn === "function" ? trainsOn : null);
    const nowObj = options.now || (typeof sgNow === "function" ? sgNow() : null);

    const fresh = !!(rtStateObj && rtStateObj.at && (options.nowMs || Date.now()) - rtStateObj.at <= 10 * 60e3);
    const tripsMap = fresh && rtStateObj.trips ? rtStateObj.trips : (options.tripsMap || null);
    if (!tripsMap && !getShifts) return [];

    const railLegs = route.legs.filter(l => l && l.line);
    const out = [];

    railLegs.forEach((leg, legIdx) => {
      let tid = leg.tid ? String(leg.tid) : "";
      let delayMin = 0;
      let cancelled = false;
      let endsEarly = "";

      // Try matching the next train on this leg if leg.tid wasn't attached directly
      if (!tid && getTrains && nowObj && linesMap && linesMap[leg.line]) {
        try {
          const list = getTrains(leg.line, nowObj) || [];
          const act = typeof activeStations === "function" ? activeStations(linesMap[leg.line], nowIso) : linesMap[leg.line].stations;
          const fromIdx = act.findIndex(s => s[0] === leg.fromCode || s[1] === leg.from);
          const toIdx = act.findIndex(s => s[0] === leg.toCode || s[1] === leg.to);
          if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
            const dir = toIdx > fromIdx ? 0 : 1;
            const cand = list
              .filter(t => t.dir === dir && ((dir === 0 && t.idx <= fromIdx + 0.15) || (dir === 1 && t.idx >= fromIdx - 0.15)))
              .sort((a, b) => Math.abs(fromIdx - a.idx) - Math.abs(fromIdx - b.idx))[0];
            if (cand) {
              if (cand.ref && cand.ref.tid) tid = String(cand.ref.tid);
              if (getShifts && nowIso) {
                const mv = getShifts(leg.line, nowIso);
                if (mv && mv.has(cand.id)) delayMin = Number(mv.get(cand.id)) || 0;
              }
            }
          }
        } catch (_) {}
      }

      if (tid && tripsMap && tripsMap[tid]) {
        const u = tripsMap[tid];
        if (u.x) cancelled = true;
        if (Number.isFinite(u.d) && Math.abs(u.d) >= 30 && !delayMin) {
          delayMin = Math.round((u.d / 60) * 10) / 10;
        }
        if (Array.isArray(u.s) && u.s.length && leg.toCode) {
          const skippedDest = u.s.find(q => q[4] === 1 && String(q[0] || "").split("_")[0] === leg.toCode);
          if (skippedDest) endsEarly = leg.to || leg.toCode;
        }
      }

      if (cancelled || endsEarly || Math.abs(delayMin) >= 2) {
        const lCode = shortLine(leg.line);
        let severity = "warn";
        let summary = "";
        if (cancelled) {
          severity = "bad";
          summary = `${lCode} train from ${leg.from} was cancelled in LTA's live feed — check the next departure.`;
        } else if (endsEarly) {
          severity = "bad";
          summary = `${lCode} train is ending early before ${endsEarly} — alight early or take the following train.`;
        } else if (delayMin >= 2) {
          severity = delayMin >= 5 ? "bad" : "warn";
          summary = `${lCode} train from ${leg.from} is running ~${Math.round(delayMin)} min late (LTA live feed).`;
        } else if (delayMin <= -2) {
          severity = "info";
          summary = `${lCode} train from ${leg.from} is running ~${Math.round(-delayMin)} min early (LTA live feed).`;
        }
        out.push({
          legIndex: legIdx,
          line: leg.line,
          from: leg.from,
          to: leg.to,
          tid,
          delayMin,
          cancelled,
          endsEarly,
          severity,
          summary,
          sig: `${leg.line}|${tid}|${cancelled ? "X" : ""}|${endsEarly}|${Math.round(delayMin)}`
        });
      }
    });

    return out;
  }

  /* Expose pure logic immediately for tests and inspection */
  const coreAPI = {
    buildReminderSchedule,
    inspectRouteGtfsRt,
    findNextUpcoming,
    stopFractions,
    formatSgtClock,
    formatCountdown
  };
  W.mrtTripReminders = coreAPI;

  /* Browser runtime initialization */
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const ready = () => {
    try {
      return typeof sgNow === "function" && typeof LINES === "object" && typeof mapInfo === "function" && typeof window.tripRemindBtn === "function";
    } catch (_) {
      return false;
    }
  };

  let bootTries = 0;
  (function waitForApp() {
    if (ready()) {
      try { initBrowser(); } catch (err) { try { console.warn("trip-reminders.js", err); } catch (_) {} }
    } else if (++bootTries < 300) {
      setTimeout(waitForApp, 180);
    }
  })();

  function initBrowser() {
    if (W.__mrtTripRemindersReady) return;
    W.__mrtTripRemindersReady = true;

    injectStyles();

    let clientId = readStore(CLIENT_KEY, "");
    if (!clientId) {
      clientId = "mrt-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      writeStore(CLIENT_KEY, clientId);
    }

    let prefs = Object.assign({}, DEFAULT_PREFS, readStore(PREFS_KEY, {}));
    let active = readStore(STATE_KEY, null);
    if (active && !(active.end > Date.now())) {
      active = null;
      writeStore(STATE_KEY, null);
    }

    const pushState = {
      vapidPublicKey: "",
      serverAvailable: false,
      subscribed: false,
      checking: false,
      statusMsg: ""
    };

    let toastTimer = null;
    let lastSig = "";

    function savePrefs() {
      writeStore(PREFS_KEY, prefs);
    }

    function saveActive() {
      writeStore(STATE_KEY, active);
    }

    function notifPermission() {
      if (typeof Notification === "undefined") return "unsupported";
      return Notification.permission || "default";
    }

    function nativeHas(fn) {
      try { return !!(window.MrtApp && typeof window.MrtApp[fn] === "function"); } catch (_) { return false; }
    }

    function nativeCall(fn) {
      try {
        if (nativeHas(fn)) return window.MrtApp[fn].apply(window.MrtApp, Array.prototype.slice.call(arguments, 1));
      } catch (_) {}
      return null;
    }

    function isNativeApp() {
      return nativeHas("tripRemind") && nativeHas("notifyState");
    }

    function currentRoute() {
      try { return typeof window.mrtTripRoute === "function" ? window.mrtTripRoute() : null; } catch (_) { return null; }
    }

    async function getSwRegistration() {
      if (!("serviceWorker" in navigator)) return null;
      try {
        const existing = await navigator.serviceWorker.getRegistration();
        if (existing) return existing;
        return await navigator.serviceWorker.register("sw.js");
      } catch (_) {
        return null;
      }
    }

    async function probePushServer() {
      if (pushState.checking) return pushState.serverAvailable;
      pushState.checking = true;
      try {
        const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 3000) : null;
        const res = await fetch("/api/push/vapid-key", {
          cache: "no-store",
          signal: ctrl ? ctrl.signal : undefined
        });
        if (timer) clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (data && data.enabled && data.publicKey) {
            pushState.vapidPublicKey = data.publicKey;
            pushState.serverAvailable = true;
          }
        }
      } catch (_) {
        pushState.serverAvailable = false;
      } finally {
        pushState.checking = false;
      }

      // Check existing subscription if permission is already granted
      if (pushState.serverAvailable && notifPermission() === "granted") {
        await syncPushSubscription(false);
      }
      refreshUI();
      return pushState.serverAvailable;
    }

    async function syncPushSubscription(allowCreate) {
      if (!pushState.serverAvailable || !pushState.vapidPublicKey) return false;
      const reg = await getSwRegistration();
      if (!reg || !reg.pushManager) return false;
      try {
        let sub = await reg.pushManager.getSubscription();
        if (!sub && allowCreate) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(pushState.vapidPublicKey)
          });
        }
        if (!sub) {
          pushState.subscribed = false;
          return false;
        }
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientId, subscription: sub.toJSON ? sub.toJSON() : sub })
        });
        pushState.subscribed = res.ok;
        return res.ok;
      } catch (_) {
        pushState.subscribed = false;
        return false;
      }
    }

    async function enablePushNotifications() {
      if (isNativeApp()) {
        nativeCall("askNotify");
        return true;
      }
      if (typeof Notification === "undefined") {
        pushState.statusMsg = "Browser push notifications aren't supported here — in-app trip alerts will still appear.";
        refreshUI();
        return false;
      }
      let perm = notifPermission();
      if (perm === "default") {
        try {
          perm = await Notification.requestPermission();
        } catch (_) {
          perm = notifPermission();
        }
      }
      if (perm === "granted") {
        if (!pushState.serverAvailable) await probePushServer();
        const subOk = await syncPushSubscription(true);
        pushState.statusMsg = subOk
          ? "Web Push notifications enabled — alerts work even when this tab is in the background."
          : "Browser notifications enabled for approaching stations.";
        if (active) syncServerSchedule();
        refreshUI();
        return true;
      }
      pushState.statusMsg = perm === "denied"
        ? "Notifications are blocked in browser settings. In-app station alerts will still pop up here."
        : "Notification prompt dismissed — using in-app station alerts.";
      refreshUI();
      return false;
    }

    async function syncServerSchedule() {
      if (!pushState.subscribed || !active || !Array.isArray(active.reminders)) return;
      const nowMs = Date.now();
      const fired = new Set(active.firedIds || []);
      const upcoming = active.reminders
        .filter(item => !fired.has(item.id) && item.at > nowMs - 5000)
        .map(item => ({
          id: item.id,
          at: item.at,
          kind: item.kind,
          line: item.line,
          stationCode: item.stationCode,
          stationName: item.stationName,
          tripKey: active.key,
          title: item.title,
          body: item.body,
          tag: item.tag
        }));
      try {
        await fetch("/api/push/schedule", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientId, tripKey: active.key, reminders: upcoming })
        });
      } catch (_) {}
    }

    async function cancelServerSchedule() {
      if (!pushState.serverAvailable) return;
      try {
        await fetch("/api/push/cancel", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientId })
        });
      } catch (_) {}
    }

    function playChime(kind) {
      if (!prefs.sound) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        const notes = kind === "destination" ? [659.25, 880, 1046.5] : kind === "transfer" ? [587.33, 880] : [523.25, 659.25];
        const t0 = ctx.currentTime;
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, t0 + idx * 0.13);
          gain.gain.setValueAtTime(0.001, t0 + idx * 0.13);
          gain.gain.exponentialRampToValueAtTime(0.09, t0 + idx * 0.13 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.13 + 0.22);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t0 + idx * 0.13);
          osc.stop(t0 + idx * 0.13 + 0.24);
        });
        setTimeout(() => { try { ctx.close(); } catch (_) {} }, 900);
      } catch (_) {}
    }

    async function dispatchSystemNotification(item) {
      if (notifPermission() !== "granted") return false;
      const payload = {
        title: item.title,
        body: item.body,
        tag: item.tag || item.id,
        kind: item.kind,
        line: item.line,
        stationCode: item.stationCode,
        stationName: item.stationName,
        tripKey: active ? active.key : ""
      };
      try {
        const reg = await getSwRegistration();
        if (reg && typeof reg.showNotification === "function") {
          await reg.showNotification(payload.title, {
            body: payload.body,
            icon: "icons/icon-192.png",
            badge: "icons/icon-192.png",
            tag: payload.tag,
            renotify: true,
            requireInteraction: payload.kind === "transfer" || payload.kind === "destination",
            data: payload
          });
          return true;
        }
      } catch (_) {}
      try {
        new Notification(payload.title, {
          body: payload.body,
          icon: "icons/icon-192.png",
          tag: payload.tag
        });
        return true;
      } catch (_) {
        return false;
      }
    }

    function showInAppToast(item) {
      let host = document.getElementById("trToastHost");
      if (!host) {
        host = document.createElement("div");
        host.id = "trToastHost";
        host.className = "tr-toast-host";
        host.setAttribute("role", "status");
        host.setAttribute("aria-live", "polite");
        document.body.appendChild(host);
      }
      const lineVar = item.line ? `var(--${item.line}, var(--fg))` : "var(--fg)";
      const badge = item.stationCode
        ? `<span class="code" style="background:${lineVar}">${escHtml(item.stationCode)}</span>`
        : item.line
          ? `<span class="code" style="background:${lineVar}">${escHtml(shortLine(item.line))}</span>`
          : "";
      host.innerHTML = `<div class="tr-toast" style="--tr-c:${lineVar}">
        <div class="tr-toast-head">${badge}<b>${escHtml(item.title)}</b><button type="button" class="tr-toast-x" aria-label="Dismiss alert">×</button></div>
        <p class="tr-toast-body">${escHtml(item.body)}</p>
      </div>`;
      const x = host.querySelector(".tr-toast-x");
      if (x) x.onclick = () => { host.innerHTML = ""; };
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { if (host) host.innerHTML = ""; }, 11000);
    }

    async function fireReminder(item, fromTest) {
      showInAppToast(item);
      playChime(item.kind);

      if (fromTest && pushState.subscribed) {
        try {
          const r = await fetch("/api/push/test", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              clientId,
              payload: {
                title: item.title,
                body: item.body,
                tag: "mrt-trip-test",
                kind: item.kind,
                line: item.line,
                stationCode: item.stationCode,
                stationName: item.stationName
              }
            })
          });
          if (r.ok) return;
        } catch (_) {}
      }

      // If server Web Push isn't active for this reminder, deliver via local SW / Notification API
      if (fromTest || !pushState.subscribed) {
        await dispatchSystemNotification(item);
      }
    }

    async function startTripReminders(route) {
      if (!route) return;
      const now = sgNow();
      const nowMs = Date.now();
      const reminders = buildReminderSchedule(route, {
        nowMins: now.mins,
        nowMs,
        mode: prefs.mode,
        leadMin: prefs.leadMin
      });

      if (!reminders.length) {
        pushState.statusMsg = "No upcoming stations left to alert on this trip.";
        refreshUI();
        return;
      }

      // Ask for browser push permission on first activation if still promptable
      if (!isNativeApp() && notifPermission() === "default") {
        await enablePushNotifications();
      } else if (!isNativeApp() && notifPermission() === "granted" && pushState.serverAvailable && !pushState.subscribed) {
        await syncPushSubscription(true);
      }

      const prevFired = active && active.key === tripKeyOf(route) ? (active.firedIds || []) : [];
      active = {
        key: tripKeyOf(route),
        from: route.from,
        to: route.to,
        arrive: route.arrive,
        mode: prefs.mode,
        leadMin: prefs.leadMin,
        startedAt: nowMs,
        end: reminders[reminders.length - 1].arrivalAt + 90000,
        reminders,
        firedIds: prevFired
      };
      lastSig = reminders.map(x => `${x.id}@${Math.round(x.at / 30000)}`).join(",");
      saveActive();

      // Forward to Android native bridge when running inside APK
      if (isNativeApp()) {
        nativeCall("tripRemind", JSON.stringify(reminders.slice(0, 12).map(x => ({
          at: x.at,
          title: x.title,
          text: x.body
        }))));
      }

      // Schedule server-sent Web Push notifications if subscribed
      await syncServerSchedule();
      refreshUI();
    }

    function stopTripReminders() {
      if (isNativeApp()) nativeCall("tripCancel");
      cancelServerSchedule();
      active = null;
      lastSig = "";
      saveActive();
      pushState.statusMsg = "";
      refreshUI();
    }

    async function sendTestAlert(route) {
      const r = route || currentRoute();
      let sample = null;
      if (r) {
        const now = sgNow();
        const list = buildReminderSchedule(r, {
          nowMins: now.mins,
          nowMs: Date.now(),
          mode: "every",
          leadMin: prefs.leadMin
        });
        sample = list.find(x => x.kind === "station" || x.kind === "transfer" || x.kind === "destination") || list[0];
      }
      if (!sample) {
        sample = {
          id: "test-" + Date.now(),
          kind: "station",
          line: "NSL",
          stationCode: "NS25",
          stationName: "City Hall",
          title: "Approaching City Hall (NS25)",
          body: "Test alert · North-South Line train arriving in ~1 min. Prepare for next station."
        };
      } else {
        sample = Object.assign({}, sample, {
          id: "test-" + Date.now(),
          title: `Test · ${sample.title}`
        });
      }

      if (!isNativeApp() && notifPermission() === "default") {
        await enablePushNotifications();
      }
      await fireReminder(sample, true);
      pushState.statusMsg = pushState.subscribed
        ? "Test Web Push sent — check your system notification and banner above."
        : notifPermission() === "granted"
          ? "Test notification dispatched via browser notifications."
          : "Test in-app alert shown above (enable browser notifications for OS push alerts).";
      refreshUI();
    }

    function isActiveFor(route) {
      return !!(active && route && active.key === tripKeyOf(route) && active.end > Date.now());
    }

    function pushBadgeHTML() {
      if (isNativeApp()) {
        const st = String(nativeCall("notifyState") || "none");
        if (st === "on") return `<span class="tr-pill tr-pill-ok">App push ready</span>`;
        if (st === "ask") return `<button type="button" class="tr-link" data-tr="enable-push">Allow push notifications</button>`;
        return `<span class="tr-pill tr-pill-warn">Notifications off in settings</span>`;
      }
      const perm = notifPermission();
      if (pushState.subscribed && perm === "granted") {
        return `<span class="tr-pill tr-pill-ok">Web Push active</span>`;
      }
      if (perm === "granted") {
        return `<span class="tr-pill tr-pill-ok">Browser alerts ready</span>`;
      }
      if (perm === "denied") {
        return `<span class="tr-pill tr-pill-warn">Push blocked · using in-app alerts</span>`;
      }
      if (perm === "unsupported") {
        return `<span class="tr-pill">In-app alerts active</span>`;
      }
      return `<button type="button" class="tr-link" data-tr="enable-push">Enable push notifications</button>`;
    }

    function renderPanelHTML(route) {
      if (!route) return "";
      const on = isActiveFor(route);
      const now = sgNow();
      const nowMs = Date.now();
      const rtAlerts = inspectRouteGtfsRt(route);
      const rtBannerHTML = rtAlerts.length
        ? `<div class="tr-rt-box">${rtAlerts.map(a => `<div class="tr-rt-warn is-${a.severity}"><b>LTA live feed</b> · ${escHtml(a.summary)}</div>`).join("")}</div>`
        : "";
      const preview = on && Array.isArray(active.reminders)
        ? active.reminders.filter(x => !(active.firedIds || []).includes(x.id) && x.arrivalAt > nowMs)
        : buildReminderSchedule(route, {
            nowMins: now.mins,
            nowMs,
            mode: prefs.mode,
            leadMin: prefs.leadMin
          });

      const upcomingRows = preview.slice(0, 4).map(item => {
        const lineColor = item.line ? `var(--${item.line}, var(--fg))` : "var(--fg)";
        const kindTag = item.kind === "board"
          ? "Board"
          : item.kind === "transfer"
            ? "Transfer"
            : item.kind === "destination"
              ? "Alight"
              : "Next stop";
        return `<li class="tr-item">
          <span class="tr-dot" style="background:${lineColor}"></span>
          <div class="tr-item-main">
            <div class="tr-item-top">
              <b>${escHtml(item.stationName)}</b>
              ${item.stationCode && item.stationCode !== item.stationName ? `<span class="code" style="background:${lineColor}">${escHtml(item.stationCode)}</span>` : ""}
              <span class="tr-kind">${kindTag}</span>
            </div>
            <span class="tr-item-sub">Alert at ${formatSgtClock(item.at)} · arrives ${formatSgtClock(item.arrivalAt)}</span>
          </div>
          <span class="tr-eta" data-tr-eta="${item.at}">${formatCountdown(item.at - nowMs)}</span>
        </li>`;
      }).join("");

      const moreCount = Math.max(0, preview.length - 4);

      return `<section class="tr-panel${on ? " is-on" : ""}" aria-label="Trip Reminder controls">
        <div class="tr-head">
          <div class="tr-title">
            <span class="tr-bell" aria-hidden="true">🔔</span>
            <div>
              <b>Trip Reminder</b>
              <small>${on ? `Tracking ${preview.length} upcoming alert${preview.length === 1 ? "" : "s"}` : "Push alerts as your train approaches each station"}</small>
            </div>
          </div>
          ${pushBadgeHTML()}
        </div>

        <div class="tr-opts">
          <div class="tr-seg" role="group" aria-label="Alert stations">
            <button type="button" data-tr="mode" data-val="every" aria-pressed="${prefs.mode === "every"}">Every station</button>
            <button type="button" data-tr="mode" data-val="key" aria-pressed="${prefs.mode === "key"}">Transfers &amp; exit</button>
          </div>
          <div class="tr-seg" role="group" aria-label="Alert lead time">
            <button type="button" data-tr="lead" data-val="1" aria-pressed="${prefs.leadMin === 1}">1 min</button>
            <button type="button" data-tr="lead" data-val="2" aria-pressed="${prefs.leadMin === 2}">2 min</button>
            <button type="button" data-tr="lead" data-val="3" aria-pressed="${prefs.leadMin === 3}">3 min</button>
          </div>
        </div>

        ${rtBannerHTML}
        ${upcomingRows ? `<ul class="tr-list">${upcomingRows}</ul>${moreCount ? `<div class="tr-more">+ ${moreCount} more station alert${moreCount === 1 ? "" : "s"} along this route</div>` : ""}` : `<p class="tr-empty">No upcoming departures left for this route today.</p>`}

        <div class="tr-foot">
          <button type="button" class="tr-mini" data-tr="sound" aria-pressed="${prefs.sound}">${prefs.sound ? "Chime on" : "Chime off"}</button>
          <button type="button" class="tr-mini" data-tr="test">Send test alert</button>
          ${on ? `<button type="button" class="tr-mini tr-stop" data-tr="stop">Stop reminders</button>` : ""}
        </div>
        ${pushState.statusMsg ? `<p class="tr-status">${escHtml(pushState.statusMsg)}</p>` : ""}
      </section>`;
    }

    /* Floating live tracker bar shown while a Trip Reminder is active */
    function renderFloatingBar() {
      let bar = document.getElementById("trFloatBar");
      const nowMs = Date.now();
      if (!active || !(active.end > nowMs)) {
        if (bar) bar.hidden = true;
        return;
      }

      const next = findNextUpcoming(active.reminders, nowMs, active.firedIds);
      if (!next) {
        if (bar) bar.hidden = true;
        return;
      }

      if (!bar) {
        bar = document.createElement("aside");
        bar.id = "trFloatBar";
        bar.className = "tr-float";
        bar.setAttribute("aria-label", "Active trip reminder");
        document.body.appendChild(bar);
        bar.addEventListener("click", e => {
          const act = e.target.closest && e.target.closest("[data-tr-bar]");
          if (!act) return;
          if (act.dataset.trBar === "stop") {
            stopTripReminders();
            return;
          }
          if (act.dataset.trBar === "open" && active) {
            try {
              const mapBtn = document.querySelector(".views button[data-v='map'], #tabMap, button[aria-controls='mapView']");
              if (mapBtn) mapBtn.click();
              if (typeof window.tripPlan === "function") window.tripPlan(active.from, active.to);
            } catch (_) {}
          }
        });
      }

      const lineColor = next.line ? `var(--${next.line}, var(--fg))` : "var(--fg)";
      const label = next.kind === "board"
        ? `Board at ${next.stationName}`
        : next.kind === "transfer"
          ? `Transfer at ${next.stationName}`
          : next.kind === "destination"
            ? `Alight at ${next.stationName}`
            : `Next: ${next.stationName}`;

      bar.hidden = false;
      bar.style.setProperty("--tr-c", lineColor);
      bar.innerHTML = `<span class="tr-float-dot"></span>
        <div class="tr-float-info">
          <b>${escHtml(label)}${next.stationCode && next.stationCode !== next.stationName ? ` <span class="code" style="background:${lineColor}">${escHtml(next.stationCode)}</span>` : ""}</b>
          <span>Alert ${formatCountdown(next.at - nowMs)} · arrives ${formatSgtClock(next.arrivalAt)} · ${escHtml(active.from)} → ${escHtml(active.to)}</span>
        </div>
        <button type="button" class="tr-float-btn" data-tr-bar="open">Trip</button>
        <button type="button" class="tr-float-x" data-tr-bar="stop" aria-label="Stop trip reminders">×</button>`;
    }

    function refreshUI() {
      try {
        if (currentRoute() && typeof mapInfo === "function") mapInfo();
      } catch (_) {}
      renderFloatingBar();
    }

    /* Override MRT Spotter's trip reminder hooks inside tripHTML() */
    window.tripRemindBtn = r => {
      const on = isActiveFor(r);
      return `<button class="btn${on ? "" : " ghost"} rt-rem-b" type="button" data-act="trip-remind-v2" aria-pressed="${on}">${on ? "🔔 Reminders on" : "🔔 Remind me"}</button>`;
    };

    window.tripRemindNote = r => renderPanelHTML(r);

    /* Delegate clicks inside #mapInfo */
    const mapInfoEl = document.getElementById("mapInfo");
    if (mapInfoEl) {
      mapInfoEl.addEventListener("click", e => {
        const toggleBtn = e.target.closest && e.target.closest("[data-act='trip-remind-v2']");
        if (toggleBtn) {
          const r = currentRoute();
          if (!r) return;
          if (isActiveFor(r)) stopTripReminders();
          else startTripReminders(r);
          return;
        }

        const ctrl = e.target.closest && e.target.closest("[data-tr]");
        if (!ctrl) return;
        const cmd = ctrl.dataset.tr;
        const r = currentRoute();

        if (cmd === "enable-push") {
          enablePushNotifications();
        } else if (cmd === "mode") {
          const val = ctrl.dataset.val === "key" ? "key" : "every";
          if (prefs.mode !== val) {
            prefs.mode = val;
            savePrefs();
            if (isActiveFor(r)) startTripReminders(r);
            else refreshUI();
          }
        } else if (cmd === "lead") {
          const val = Math.max(1, Math.min(3, Number(ctrl.dataset.val) || 1));
          if (prefs.leadMin !== val) {
            prefs.leadMin = val;
            savePrefs();
            if (isActiveFor(r)) startTripReminders(r);
            else refreshUI();
          }
        } else if (cmd === "sound") {
          prefs.sound = !prefs.sound;
          savePrefs();
          if (prefs.sound) playChime("station");
          refreshUI();
        } else if (cmd === "test") {
          sendTestAlert(r);
        } else if (cmd === "stop") {
          stopTripReminders();
        }
      });
    }

    /* Listen for action messages from the Service Worker (e.g., notification action buttons) */
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", e => {
        const msg = e.data;
        if (!msg || msg.type !== "TRIP_REMINDER_ACTION") return;
        if (msg.action === "stop") {
          stopTripReminders();
        } else if (msg.action === "view" && active && typeof window.tripPlan === "function") {
          window.tripPlan(active.from, active.to);
        }
      });
    }

    /* 1-second live approach monitor: fires due reminders & updates live countdowns */
    setInterval(() => {
      const nowMs = Date.now();
      if (active) {
        if (!(active.end > nowMs)) {
          stopTripReminders();
          return;
        }
        const fired = new Set(active.firedIds || []);
        let changed = false;
        for (const item of active.reminders || []) {
          if (!fired.has(item.id) && nowMs >= item.at && nowMs <= item.arrivalAt + 45000) {
            fired.add(item.id);
            changed = true;
            fireReminder(item, false);
          }
        }
        if (changed) {
          active.firedIds = [...fired];
          saveActive();
          refreshUI();
          return;
        }
        renderFloatingBar();
      }

      // Live-update countdown labels in the visible panel without full re-render
      const etaEls = document.querySelectorAll("[data-tr-eta]");
      for (const el of etaEls) {
        const at = Number(el.dataset.trEta);
        if (at) el.textContent = formatCountdown(at - nowMs);
      }
    }, 1000);

    /* Keep active reminders synced when planned route times shift or GTFS-RT reports a delay/cancellation */
    setInterval(() => {
      if (!active) return;
      const r = currentRoute();
      if (!r || tripKeyOf(r) !== active.key) return;
      const rtAlerts = inspectRouteGtfsRt(r);
      const alerted = new Set(active.rtAlertSigs || []);
      let rtChanged = false;
      for (const a of rtAlerts) {
        if (!alerted.has(a.sig)) {
          alerted.add(a.sig);
          rtChanged = true;
          fireReminder({
            id: "rt-" + a.sig,
            kind: "transfer",
            line: a.line,
            stationCode: "",
            stationName: a.from,
            title: a.cancelled ? `${shortLine(a.line)} train cancelled` : a.endsEarly ? `${shortLine(a.line)} train ending early` : `${shortLine(a.line)} delay update`,
            body: a.summary,
            tag: `mrt-rem-rt-${active.key}-${a.legIndex}`
          }, false);
        }
      }
      if (rtChanged) {
        active.rtAlertSigs = [...alerted];
        saveActive();
      }
      const now = sgNow();
      const nextList = buildReminderSchedule(r, {
        nowMins: now.mins,
        nowMs: Date.now(),
        mode: prefs.mode,
        leadMin: prefs.leadMin
      });
      const sig = nextList.map(x => `${x.id}@${Math.round(x.at / 30000)}`).join(",");
      if (nextList.length && sig !== lastSig) {
        startTripReminders(r);
      } else if (rtChanged) {
        refreshUI();
      }
    }, 30000);

    /* Public runtime API */
    Object.assign(coreAPI, {
      start: startTripReminders,
      stop: stopTripReminders,
      enablePush: enablePushNotifications,
      sendTest: sendTestAlert,
      getActive: () => active,
      getPrefs: () => Object.assign({}, prefs),
      getPushState: () => Object.assign({}, pushState, { permission: notifPermission() })
    });

    probePushServer();
    renderFloatingBar();
  }

  function injectStyles() {
    if (document.getElementById("mrt-trip-reminders-css")) return;
    const style = document.createElement("style");
    style.id = "mrt-trip-reminders-css";
    style.textContent = `
.tr-panel{margin-top:10px;padding:12px;border-radius:12px;background:var(--soft);border:1px solid var(--rule);display:grid;gap:10px}
.tr-panel.is-on{border-color:var(--good);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--good) 28%,transparent)}
.tr-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.tr-title{display:flex;align-items:center;gap:8px;min-width:0}
.tr-bell{font-size:17px;line-height:1}
.tr-title b{display:block;font-size:13.5px;line-height:1.2;color:var(--fg)}
.tr-title small{display:block;font-size:11.5px;color:var(--muted);margin-top:1px}
.tr-pill{font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px;background:var(--panel);color:var(--muted);border:1px solid var(--rule);white-space:nowrap}
.tr-pill-ok{background:var(--goodbg);color:var(--good);border-color:color-mix(in srgb,var(--good) 35%,transparent)}
.tr-pill-warn{background:var(--warnbg);color:var(--warn);border-color:color-mix(in srgb,var(--warn) 35%,transparent)}
.tr-link{border:1px solid var(--fg);background:var(--fg);color:var(--bg);font:600 11.5px var(--body);padding:4px 9px;border-radius:7px;cursor:pointer;white-space:nowrap}
.tr-link:hover{opacity:.88}
.tr-opts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.tr-seg{display:inline-flex;background:var(--panel);border:1px solid var(--rule);border-radius:8px;padding:2px;gap:2px}
.tr-seg button{border:0;background:none;color:var(--muted);font:600 11.5px var(--body);padding:4px 8px;border-radius:6px;cursor:pointer}
.tr-seg button[aria-pressed="true"]{background:var(--fg);color:var(--bg)}
.tr-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.tr-item{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:8px;align-items:center;padding:7px 9px;background:var(--panel);border:1px solid var(--rule);border-radius:9px}
.tr-dot{width:10px;height:10px;border-radius:50%;flex:none}
.tr-item-main{min-width:0}
.tr-item-top{display:flex;align-items:center;gap:5px;flex-wrap:wrap;font-size:13px}
.tr-item-top b{color:var(--fg)}
.tr-kind{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.tr-item-sub{display:block;font-size:11.5px;color:var(--muted);margin-top:1px}
.tr-eta{font-family:var(--mono);font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--fg);white-space:nowrap}
.tr-more{font-size:11.5px;color:var(--muted);padding-left:2px}
.tr-empty{margin:0;font-size:12px;color:var(--muted)}
.tr-foot{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.tr-mini{border:1px solid var(--rule);background:var(--panel);color:var(--fg);font:600 11.5px var(--body);padding:5px 9px;border-radius:7px;cursor:pointer}
.tr-mini:hover{background:var(--bg)}
.tr-mini.tr-stop{border-color:color-mix(in srgb,var(--bad) 45%,transparent);color:var(--bad);margin-left:auto}
.tr-status{margin:0;font-size:11.5px;color:var(--muted);line-height:1.35}
.tr-rt-box{display:grid;gap:5px}
.tr-rt-warn{font-size:12px;line-height:1.35;padding:7px 9px;border-radius:8px;border:1px solid var(--rule);background:var(--warnbg);color:var(--fg)}
.tr-rt-warn.is-bad{background:var(--badbg);border-color:color-mix(in srgb,var(--bad) 40%,transparent)}
.tr-rt-warn.is-info{background:var(--soft)}
.tr-float{position:fixed;left:50%;bottom:calc(68px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:70;width:min(520px,calc(100vw - 24px));background:var(--panel);color:var(--fg);border:1px solid var(--rule);border-left:5px solid var(--tr-c,var(--fg));border-radius:12px;box-shadow:var(--shadow);padding:9px 10px 9px 12px;display:flex;align-items:center;gap:10px}
.tr-float-dot{width:9px;height:9px;border-radius:50%;background:var(--tr-c,var(--good));flex:none;box-shadow:0 0 0 4px color-mix(in srgb,var(--tr-c,var(--good)) 22%,transparent)}
.tr-float-info{min-width:0;flex:1}
.tr-float-info b{display:flex;align-items:center;gap:6px;font-size:13px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tr-float-info span{display:block;font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.tr-float-btn{border:1px solid var(--rule);background:var(--soft);color:var(--fg);font:600 12px var(--body);padding:5px 10px;border-radius:7px;cursor:pointer;flex:none}
.tr-float-x{border:0;background:none;color:var(--muted);font-size:18px;line-height:1;padding:2px 5px;cursor:pointer;flex:none}
.tr-toast-host{position:fixed;top:calc(12px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:120;width:min(440px,calc(100vw - 24px));pointer-events:none}
.tr-toast{pointer-events:auto;background:var(--panel);color:var(--fg);border:1px solid var(--rule);border-left:5px solid var(--tr-c,var(--fg));border-radius:12px;box-shadow:var(--shadow);padding:11px 12px;animation:trIn .22s ease-out}
.tr-toast-head{display:flex;align-items:center;gap:7px;font-size:13.5px}
.tr-toast-head b{flex:1;min-width:0}
.tr-toast-x{border:0;background:none;color:var(--muted);font-size:18px;line-height:1;cursor:pointer;padding:0 4px}
.tr-toast-body{margin:4px 0 0;font-size:12.5px;color:var(--muted);line-height:1.4}
@keyframes trIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
`;
    document.head.appendChild(style);
  }
})();

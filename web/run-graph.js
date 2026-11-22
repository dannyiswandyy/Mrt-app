/* Train runs (scheduled duties) reconstructed from LTA's GTFS, for MRT Dev.
 *
 * Works on the packed timetable the app already has (TT: services, except, lines.{pats, trips, tripMeta}),
 * built by android/tools/build_timetable.py and Timetable.java. It never parses GTFS itself.
 *
 * LTA's MRT trip_id convention (found by reverse-engineering, see the GTFS report):
 *   LINE_[BRANCH_]DIRECTION_DAYTYPE[_SPECIAL]_RUN_TRIPNO     e.g. NSL_SB_WD_407_538, EWL_CGL_EB_WD_101_2949,
 *                                                                 CCL_Clockwise_WD_SPECIAL_0057_0053
 *   LRT: SYSTEM_SERVICE_DAYTYPE_N (BPLRT_A_WD_17): no run number.
 * (service_id, RUN) is a train's scheduled duty for the day: its trips chain end to start. It is NOT a
 * physical trainset: nothing in LTA's GTFS says which train works a run.
 *
 * Every inference carries its evidence and one of four labels. Nothing inferred is ever labelled CONFIRMED.
 * Works in the page (window.mrtRunGraph) and in Node tests (globalThis.mrtRunGraph).
 */
(function (root) {
  "use strict";
  const L = {
    CONFIRMED: "CONFIRMED BY DATA",
    STRONG: "STRONG INFERENCE",
    POSSIBLE: "POSSIBLE",
    NONE: "NOT SUPPORTED"
  };
  const DAYTYPES = new Set(["WD", "WE", "PH"]);
  const isNum = s => /^\d+$/.test(s || "");
  const pad = n => String(n).padStart(2, "0");
  /** Seconds since the service day began (can pass 24:00) as HH:MM:SS. */
  const hms = s => { s = Math.round(s); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
  const hm = s => hms(s).slice(0, 5);
  /** HH:MM on a 24-hour clock, for people (25:04 → 01:04). */
  const clock = s => { const m = Math.floor(Math.round(s) / 60) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
  const mins = s => Math.round(s / 60);
  const ev = (label, inference, evidence, extra) => Object.assign({label, inference, evidence: [].concat(evidence)}, extra || {});

  /* ---------- trip IDs ---------- */
  /** Splits an LTA trip_id. run is null when the ID has none (the LRTs). */
  function parseTripId(tid) {
    const p = String(tid || "").split("_"), n = p.length;
    const out = {tid: String(tid || ""), system: p[0] || "", branch: "", direction: "", dayType: "", special: false, run: null, runNum: null, tripNo: null, kind: "unknown"};
    const di = p.findIndex(x => DAYTYPES.has(x));
    if (di < 0) return out;
    out.dayType = p[di];
    out.special = p.slice(di + 1).includes("SPECIAL");
    if (/LRT$/.test(p[0])) {                         // BPLRT_A_WD_17, SKLRT_EI_PH_1
      out.kind = "lrt"; out.direction = p.slice(1, di).join("_");
      if (isNum(p[n - 1])) out.tripNo = +p[n - 1];
      return out;
    }
    if (n >= 4 && isNum(p[n - 1]) && isNum(p[n - 2])) {
      out.kind = "mrt";
      out.direction = p[di - 1] || "";
      out.branch = p.slice(1, Math.max(1, di - 1)).join("_");     // MAIN or CGL on EWL, else ""
      out.run = p[n - 2]; out.runNum = +p[n - 2];
      out.tripNo = +p[n - 1];
    }
    return out;
  }

  /* ---------- trips: legs of the packed timetable put back together ---------- */
  // The packer splits a trip where it turns or jumps (Circle Line loop joins, LRT loops, and a few odd trips),
  // so one trip_id can have several legs. They are joined again here.
  function tripsOf(TT, code, stationsOf) {
    const Ln = TT && TT.lines && TT.lines[code]; if (!Ln) return [];
    const st = stationsOf ? stationsOf(code) : null;
    const name = i => st && st[i] ? st[i][1] : `#${i}`;
    const svc = TT.services || [];
    const by = new Map();
    for (const [s, pi, si, tid] of Ln.trips || []) {
      const p = Ln.pats[pi]; if (!p) continue;
      const n = p[2].length, last = p[0] + p[1] * (n - 1);
      const leg = {s, pi, dep: s + (p[3][0] || 0), arr: s + p[2][n - 1], from: p[0], to: last, step: p[1], stops: n,
        fromName: name(p[0]), toName: name(last)};
      const k = si + "|" + tid;
      let t = by.get(k);
      if (!t) by.set(k, t = {tid, line: code, si, service: (svc[si] || [])[0] || String(si), legs: []});
      t.legs.push(leg);
    }
    const out = [];
    for (const t of by.values()) {
      t.legs.sort((a, b) => a.s - b.s);
      const a = t.legs[0], z = t.legs[t.legs.length - 1], m = (Ln.tripMeta || {})[t.tid] || null;
      t.id = parseTripId(t.tid);
      t.dep = a.dep; t.arr = z.arr;
      t.stops = t.legs.reduce((x, l, i) => x + l.stops - (i ? 1 : 0), 0);
      // names and platform sides: LTA's own first/last stop when the packer kept them, else the legs
      t.originStop = m && m.first || ""; t.destStop = m && m.last || "";
      t.origin = m && m.firstName || a.fromName; t.dest = m && m.lastName || z.toName;
      t.originSide = sideOf(t.originStop); t.destSide = sideOf(t.destStop);
      t.headsign = m && m.headsign || ""; t.route = m && m.route || "";
      t.block = m && m.block || "";
      t.anomalies = [];
      const codeAt = i => st && st[i] ? st[i][0] : "", stopCode = id => String(id || "").replace(/_[A-Z]$/, "");
      const known = c => st && st.some(x => x[0] === c);
      if (m && m.first && st && known(stopCode(m.first)) && stopCode(m.first) !== codeAt(a.from)) {
        t.anomalies.push(ev(L.CONFIRMED, `LTA lists ${m.firstName} as the first stop, but the app's copy has no times until ${a.fromName}, several stations on. Whether the train runs non-stop or the packer couldn't match the stops between is not known (POSSIBLE either way)`,
          `${t.tid}: first stop_id ${m.first} (${m.firstName}); first timed leg starts at ${a.fromName} ${hms(a.dep)}`, {kind: "stop-list-gap"}));
        t.listedOrigin = m.firstName; t.origin = a.fromName; t.originStop = "";     // times below are from the first timed stop
      }
      const dirs = t.legs.map(l => l.step);
      if (t.legs.length > 1 && dirs.some(d => d !== dirs[0]) && !/LRT$/.test(t.id.system) && code !== "CCL") {
        const at = t.legs.find((l, i) => i && l.step !== t.legs[i - 1].step);
        t.anomalies.push(ev(L.CONFIRMED, `This one trip_id turns round partway, at ${at ? at.fromName : "?"}`,
          t.legs.map(l => `${l.fromName} ${hms(l.dep)} → ${l.toName} ${hms(l.arr)} (${l.stops} stops)`), {kind: "reverses-within-trip"}));
      }
      out.push(t);
    }
    return out.sort((x, y) => x.dep - y.dep);
  }
  const sideOf = stopId => { const m = /_([A-Z])$/.exec(stopId || ""); return m ? m[1] : ""; };

  /* ---------- the graph ---------- */
  /**
   * build(TT, {stationsOf: code => [[code, name], ...]}) → {lines: {CODE: lineGraph}}
   * lineGraph: {code, runs: [run], trips: [trip], counter, stations, termini, anomalies, lrt}
   * run: {key, service, run, trips, first, last, start, end, cls, links, leaves, enters, partway, summary}
   */
  function build(TT, opts) {
    opts = opts || {};
    const out = {lines: {}, builtAt: Date.now(), feed: TT && TT.feed ? TT.feed.built : ""};
    for (const code of Object.keys((TT && TT.lines) || {})) out.lines[code] = buildLine(TT, code, opts.stationsOf);
    return out;
  }

  function buildLine(TT, code, stationsOf) {
    const trips = tripsOf(TT, code, stationsOf);
    const g = {code, trips, runs: [], anomalies: [], lrt: false, counter: null, termini: {}, stations: {}};
    const byRun = new Map();
    for (const t of trips) {
      if (t.id.kind === "lrt") { g.lrt = true; continue; }
      if (t.id.run == null) continue;
      const key = t.service + "|" + t.id.run;
      if (!byRun.has(key)) byRun.set(key, []);
      byRun.get(key).push(t);
      for (const a of t.anomalies) g.anomalies.push(Object.assign({tid: t.tid, service: t.service}, a));
    }
    if (g.lrt && !byRun.size) {
      g.note = ev(L.NONE, "LRT trip IDs (e.g. BPLRT_A_WD_17) carry no run number, so trips can't be grouped into train duties from the timetable",
        trips.slice(0, 2).map(t => t.tid));
    }
    // termini per service: the two ends of the longest pattern(s), plus any station that ends ≥ 15% of trips
    const services = [...new Set(trips.map(t => t.service))];
    for (const svc of services) {
      const ts = trips.filter(t => t.service === svc && t.id.kind === "mrt");
      if (!ts.length) continue;
      const maxStops = Math.max(...ts.map(t => t.stops));
      const end = new Map();
      for (const t of ts) end.set(t.dest, (end.get(t.dest) || 0) + 1);
      const term = new Set();
      for (const t of ts) if (t.stops === maxStops) { term.add(t.origin); term.add(t.dest); }
      for (const [s, c] of end) if (c >= 0.15 * ts.length) term.add(s);
      g.termini[svc] = {stations: [...term].sort(), evidence: `longest pattern ${maxStops} stops; stations ending ≥15% of ${ts.length} trips`};
    }
    // runs
    for (const [key, list] of byRun) {
      list.sort((a, b) => a.dep - b.dep);
      const [service, run] = key.split("|");
      const r = {key, line: code, service, run, runNum: +run, trips: list, first: list[0], last: list[list.length - 1],
        start: list[0].dep, end: list[list.length - 1].arr, links: []};
      list.forEach((t, i) => { t.run = r; t.index = i; t.prev = list[i - 1] || null; t.next = list[i + 1] || null; });
      for (let i = 0; i + 1 < list.length; i++) r.links.push(linkOf(list[i], list[i + 1]));
      g.runs.push(r);
    }
    g.runs.sort((a, b) => a.service.localeCompare(b.service) || a.runNum - b.runNum);
    g.counter = counterMode(g);
    for (const r of g.runs) for (const k of r.links) jumpOf(g, k);
    stationProfiles(g);
    g.byRunNo = new Map();
    for (const t of trips) if (t.id.run != null) { const key = `${t.id.run}|${t.id.tripNo}`; if (!g.byRunNo.has(key)) g.byRunNo.set(key, []); g.byRunNo.get(key).push(t); }
    for (const r of g.runs) for (const k of r.links) refineJump(g, k);
    pairings(g, TT);
    entriesAndExits(g);
    g.blockInfo = blockInfo(g);
    for (const r of g.runs) classify(r);
    for (const r of g.runs) r.summary = summarise(r);
    return g;
  }

  /** What happens between two trips of the same run. */
  function linkOf(a, b) {
    const gap = b.dep - a.arr;
    const k = {from: a, to: b, gap, station: a.dest, items: []};
    const reverse = a.id.direction && b.id.direction && a.id.direction !== b.id.direction;
    if (a.dest === b.origin) {
      if (gap < 0) {
        k.type = "overlap";
        k.items.push(ev(L.CONFIRMED, `Next trip leaves ${-gap} s before this one arrives: an inconsistency in LTA's times (most likely rounding)`,
          `${a.tid} arrives ${a.dest} ${hms(a.arr)}; ${b.tid} departs ${b.origin} ${hms(b.dep)}`));
      } else {
        k.type = reverse ? "turnaround" : "continues";
        const sides = a.destSide && b.originSide ? ` (arrives on side ${a.destSide}, leaves from side ${b.originSide})` : "";
        k.items.push(ev(L.CONFIRMED, reverse ? `Turns round at ${a.dest} in ${fmtGap(gap)}${sides}` : `Carries straight on at ${a.dest} after ${fmtGap(gap)}${sides}`,
          `${a.tid} arrives ${a.dest} ${hms(a.arr)} (${a.destStop || "stop"}); ${b.tid} departs ${hms(b.dep)} (${b.originStop || "stop"})`));
      }
    } else {
      k.type = "missing";
      const near = adjacent(a, b);
      const label = gap > 0 && near ? L.STRONG : gap > 0 ? L.POSSIBLE : L.NONE;
      k.items.push(ev(label,
        gap > 0 ? `Likely an unpublished movement ${a.dest} → ${b.origin} (${near ? "next-door stations" : "not next-door stations"}, ${fmtGap(gap)} between)` :
          `The next trip starts somewhere else before this one gets in: no movement fits`,
        `Run ${a.id.run} ends ${a.tid} at ${a.dest} ${hms(a.arr)} and its next published trip ${b.tid} begins at ${b.origin} ${hms(b.dep)}.`,
        {kind: "missing-movement", fromStation: a.dest, toStation: b.origin}));
    }
    return k;
  }
  function adjacent(a, b) {
    const x = a.legs[a.legs.length - 1].to, y = b.legs[0].from;
    return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) === 1;
  }
  const fmtGap = s => s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${pad(s % 60)} s`;

  /* ---------- trip-number counters ---------- */
  /** Does this line's trip number count along each run (TEL, CCL) or per direction (NSL, EWL, NEL, DTL)? */
  function counterMode(g) {
    let n = 0, small = 0;
    for (const r of g.runs) for (const k of r.links) { const d = k.to.id.tripNo - k.from.id.tripNo; if (!Number.isFinite(d)) continue; n++; if (d >= 1 && d <= 4) small++; }
    if (!n) return {mode: "none", share: 0, pairs: 0, item: ev(L.NONE, "No consecutive trips with numbers to compare", [])};
    const share = small / n, seq = share >= 0.9;
    return {mode: seq ? "run" : "direction", share, pairs: n,
      item: ev(L.CONFIRMED, seq ? "The trip number counts up along each run, so skipped numbers can be read" :
        "The trip number is a counter per direction, not per run: steps between a run's trips can't be read as movements",
        `${small} of ${n} consecutive trips in a run differ by 1–4 (${Math.round(share * 100)}%)`)};
  }
  function jumpOf(g, k) {
    const d = k.to.id.tripNo - k.from.id.tripNo;
    k.step = Number.isFinite(d) ? d : null;
    k.hidden = g.counter.mode === "run" && k.step != null ? k.step - 1 : null;
  }
  const pkey = k => `${k.station}|${k.from.destSide || "?"}→${k.to.originSide || "?"}|${k.type}`;
  /** For each turnaround place, how the counter steps there across all runs (counts only; no meaning attached). */
  function stationProfiles(g) {
    g.jumpProfiles = {};
    if (g.counter.mode !== "run") return;
    for (const r of g.runs) for (const k of r.links) {
      if (k.step == null || k.type === "missing" || k.type === "overlap") continue;
      const p = g.jumpProfiles[pkey(k)] || (g.jumpProfiles[pkey(k)] = {station: k.station, sides: `${k.from.destSide || "?"}→${k.to.originSide || "?"}`, type: k.type, n: 0, hist: {}});
      p.n++; p.hist[k.step] = (p.hist[k.step] || 0) + 1;
    }
    for (const p of Object.values(g.jumpProfiles)) {
      const [mode, c] = Object.entries(p.hist).sort((a, b) => b[1] - a[1])[0];
      p.mode = +mode; p.share = c / p.n;
      p.label = L.CONFIRMED;
      p.inference = `Counter +${p.mode} at ${p.station} (${p.type === "continues" ? "carrying straight on" : "reversing"})`;
      p.evidence = `${c} of ${p.n} ${p.type === "continues" ? "continuations" : "reversals"} at ${p.station} (${p.sides}) step +${p.mode}`;
      p.reading = null;
    }
    // A line-wide rule: does every reversal add the same extra number (CCL), or does it depend on the station (TEL)?
    let rev = 0, rev2 = 0, cont = 0, cont1 = 0;
    for (const p of Object.values(g.jumpProfiles)) for (const [st, c] of Object.entries(p.hist)) {
      if (p.type === "turnaround") { rev += c; if (+st === 2) rev2 += c; } else if (p.type === "continues") { cont += c; if (+st === 1) cont1 += c; }
    }
    g.counterRule = rev && rev2 / rev >= 0.9 && (!cont || cont1 / cont >= 0.9)
      ? {kind: "reversal+1", rev, rev2, cont, cont1,
        item: ev(L.CONFIRMED, "The counter advances by 1 for each trip and by one additional number at a reversal",
          `${rev2} of ${rev} reversals step +2 (${Math.round(rev2 / rev * 100)}%); ${cont1} of ${cont} straight-on continuations step +1`)}
      : {kind: "per-station", rev, rev2, cont, cont1,
        item: ev(L.CONFIRMED, "How far the counter jumps at a reversal depends on the station", Object.values(g.jumpProfiles).filter(p => p.type === "turnaround").map(p => p.evidence))};
    if (g.counterRule.kind === "per-station") for (const p of Object.values(g.jumpProfiles)) {
      if (p.type === "turnaround" && p.mode === 3 && p.n >= 5 && p.share >= 0.9)
        p.reading = ev(L.STRONG, `Consistent with the train running beyond the platform at ${p.station} (into a siding or extension) and back; GTFS doesn't publish that movement`,
          [p.evidence, "a +1 reversal elsewhere on the line adds no extra number"]);
    }
  }
  /** A skipped number that is a published trip elsewhere: same run, same number, another timetable, same place and time. */
  function matchSkipped(g, k, n) {
    const out = [];
    for (const t of g.byRunNo.get(`${k.from.id.run}|${n}`) || []) {
      if (t.service === k.from.service) continue;
      if (t.origin === k.from.dest && t.dep >= k.from.arr - 120 && t.arr <= k.to.dep + 120) out.push(t);
    }
    return out;
  }
  function refineJump(g, k) {
    if (k.step == null || g.counter.mode !== "run") return;
    const a = k.from, b = k.to, pair = `${a.tid} → ${b.tid}: step +${k.step}`;
    if (k.step <= 0) { k.extra = 0; k.items.push(ev(L.CONFIRMED, `Trip number doesn't advance (${a.id.tripNo} → ${b.id.tripNo})`, pair)); return; }
    let expected = null;
    if (g.counterRule.kind === "reversal+1") expected = k.type === "continues" ? 1 : k.type === "turnaround" ? 2 : null;
    else { const p = g.jumpProfiles[pkey(k)]; expected = k.type === "missing" ? null : p ? p.mode : 1; }
    k.expected = expected;
    k.extra = expected == null ? null : k.step - expected;
    // a "jump" in the run summary: numbers beyond the CCL rule, any step over +1 on TEL, or a skip across a gap
    k.jump = g.counterRule.kind === "reversal+1" ? (k.extra != null ? k.extra > 0 : k.step > 1) : k.step > 1;
    if (k.type === "missing") {
      // Only a skipped number that matches a real trip elsewhere is described as a movement
      const found = [];
      for (let n = a.id.tripNo + 1; n < b.id.tripNo; n++) for (const t of matchSkipped(g, k, n)) found.push([n, t]);
      k.items.push(ev(L.CONFIRMED, `Counter skips ${k.step - 1} number${k.step === 2 ? "" : "s"} across this gap`, pair, {kind: "counter-jump"}));
      for (const [n, t] of found) k.items.push(ev(L.STRONG, `Skipped number ${n} is published as ${t.tid} on ${t.service} (${t.origin} → ${t.dest}, ${hms(t.dep)}–${hms(t.arr)}): likely the movement in this gap`,
        [pair, `${t.tid}: same run ${t.id.run}, same number ${n}, starts at ${t.origin} inside this gap`], {kind: "matched-skip"}));
      return;
    }
    if (g.counterRule.kind === "reversal+1") {
      if (k.extra === 0) {
        k.items.push(k.type === "turnaround"
          ? ev(L.CONFIRMED, "CCL counter advances by one additional number at a reversal.", [pair, g.counterRule.item.evidence[0]], {kind: "counter-jump"})
          : ev(L.CONFIRMED, "Counter advances by 1 to the next trip", pair, {kind: "counter-jump"}));
        return;
      }
      const found = [];
      for (let n = a.id.tripNo + expected; n < b.id.tripNo; n++) for (const t of matchSkipped(g, k, n)) found.push([n, t]);
      const first = a.index === 0;
      k.items.push(ev(L.CONFIRMED, k.extra > 0 ? `Counter advances ${k.extra} more than the usual +${expected} here` : `Counter advances ${-k.extra} less than the usual +${expected} here`,
        [pair].concat(first && k.extra > 0 ? ["this is the run's first link: most CCL runs carry one extra number at the start of their day"] : []), {kind: "counter-jump"}));
      if (found.length) for (const [n, t] of found) k.items.push(ev(L.STRONG, `Skipped number ${n} is published as ${t.tid} on ${t.service}: likely an unpublished movement here`, [pair, `${t.tid} ${t.origin} → ${t.dest} ${hms(t.dep)}`], {kind: "matched-skip"}));
      else if (k.extra > 0) k.items.push(ev(L.POSSIBLE, "What the extra number stands for isn't in the data (no trip elsewhere carries it)", pair));
      return;
    }
    // per-station counters (TEL)
    const p = g.jumpProfiles[pkey(k)];
    const usual = p && p.mode === k.step;
    k.items.push(ev(L.CONFIRMED, `Counter +${k.step} at ${k.station}${usual ? "" : ` (unusual here: usually +${p ? p.mode : "?"})`}`, [pair].concat(p ? [p.evidence] : []), {kind: "counter-jump"}));
    if (usual && p.reading) k.items.push(p.reading);
  }

  /* ---------- paired numbering at a terminus (NEL, CG at weekends) ---------- */
  /**
   * On lines numbered per direction, find termini where the next trip's number is the arriving trip's number plus a
   * fixed offset (NEL Punggol Coast +1001, CG Changi Airport +114 on Saturdays, +112 on Sundays). Only the places
   * confirmed by the third-pass analysis are used (PAIRED below), and a rule is only applied when it holds for at
   * least 90% of 20+ reversals in that service, so CG weekdays (49 of 109) get none.
   */
  const PAIRED = {NEL: {station: "Punggol Coast", days: null}, CG: {station: "Changi Airport", days: ["0000010", "0000001"]}};
  function pairings(g, TT) {
    g.pairings = [];
    const want = PAIRED[g.code];
    if (!want || !g.counter || g.counter.mode !== "direction") return;
    const by = {};
    for (const r of g.runs) for (const k of r.links) if (k.type === "turnaround" && k.step != null) {
      const key = `${r.service}|${k.station}|${k.from.id.direction}`;
      (by[key] = by[key] || []).push(k);
    }
    const dayOf = svc => { const s = (TT.services || []).find(x => x[0] === svc); return s ? s[1] : ""; };
    for (const [key, ks] of Object.entries(by)) {
      const [service, station, fromDir] = key.split("|");
      if (station !== want.station || (want.days && !want.days.includes(dayOf(service)))) continue;
      const hist = {}; for (const k of ks) hist[k.step] = (hist[k.step] || 0) + 1;
      const [off, c] = Object.entries(hist).sort((a, b) => b[1] - a[1])[0];
      if (ks.length < 20 || c / ks.length < 0.9) continue;
      const offset = +off, toDir = ks[0].to.id.direction, mask = dayOf(service);
      const days = mask === "0000010" ? "Saturday" : mask === "0000001" ? "Sunday" : mask === "1111100" ? "weekday" : mask;
      const rule = {service, station, fromDir, toDir, offset, days, n: ks.length, hits: c, exceptions: [], missing: [], starts: [],
        item: ev(L.CONFIRMED, `At ${station} (${days}), the ${toDir} trip number = the arriving ${fromDir} trip number + ${offset}`, `${c} of ${ks.length} reversals at ${station} on ${service}`)};
      const toNos = new Set(g.trips.filter(t => t.service === service && t.id.direction === toDir).map(t => t.id.tripNo));
      for (const k of ks) {
        if (k.step === offset) { k.items.push(ev(L.CONFIRMED, `Paired working: ${toDir} ${k.to.id.tripNo} = ${fromDir} ${k.from.id.tripNo} + ${offset}`, [`${k.from.tid} → ${k.to.tid}`, rule.item.evidence[0]], {kind: "pairing"})); continue; }
        const firstOfDay = k.from.index === 0 && g.runs.filter(x => x.service === service).every(x => x.start >= k.from.run.start);
        const edge = k.from.index === 0 || k.to.index === k.to.run.trips.length - 1;
        const why = edge ? (k.from.index === 0 ? "first trip of the run" : "last trip of the run") : "mid-run";
        const item = ev(L.CONFIRMED, `Exception to the pairing: ${k.from.id.tripNo} → ${k.to.id.tripNo} (+${k.step}, not +${offset}); ${why}${firstOfDay && k.from.index === 0 ? ", the first train of the day" : ""}`, `${k.from.tid} → ${k.to.tid}`, {kind: "pairing-exception"});
        k.items.push(item); rule.exceptions.push(item);
      }
      // arriving trips whose run ends here: is the paired number used?
      for (const r of g.runs) if (r.service === service && r.last.dest === station && r.last.id.direction === fromDir) {
        const n = r.last.id.tripNo + offset;
        if (!toNos.has(n)) {
          const item = ev(L.POSSIBLE, "POSSIBLE WITHDRAWAL / MISSING PAIRED WORKING",
            [`${r.last.tid} arrives ${station} ${hms(r.last.arr)} and its run ends here`, `no ${toDir} trip ${n} (= ${r.last.id.tripNo} + ${offset}) exists on ${service}`], {kind: "pairing-missing", tid: r.last.tid});
          r.notes = (r.notes || []).concat(item); rule.missing.push(item);
        }
      }
      // trips in the other direction that start here without an arriving train
      for (const r of g.runs) if (r.service === service && r.first.origin === station && r.first.id.direction === toDir) {
        const item = ev(L.CONFIRMED, `Starts at ${station} without an arriving train: no paired ${fromDir} trip`, `${r.first.tid} departs ${station} ${hms(r.start)} as run ${r.run}'s first trip`, {kind: "pairing-start", tid: r.first.tid});
        r.notes = (r.notes || []).concat(item); rule.starts.push(item);
      }
      g.pairings.push(rule);
    }
  }

  /* ---------- entering and leaving service ---------- */
  function entriesAndExits(g) {
    const starts = {}, ends = {};
    for (const r of g.runs) {
      (starts[r.service] = starts[r.service] || {})[r.first.origin] = ((starts[r.service] || {})[r.first.origin] || 0) + 1;
      (ends[r.service] = ends[r.service] || {})[r.last.dest] = ((ends[r.service] || {})[r.last.dest] || 0) + 1;
    }
    g.stations = {starts, ends};
    for (const r of g.runs) {
      const term = new Set((g.termini[r.service] || {}).stations || []);
      r.partway = {starts: !term.has(r.first.origin), ends: !term.has(r.last.dest)};
      // where the run leaves published service, and whether anything else starts from there afterwards
      const later = g.runs.filter(x => x.service === r.service && x !== r && x.first.origin === r.last.dest && x.start >= r.end && x.start - r.end <= 3600)
        .sort((a, b) => a.start - b.start);
      const base = `Run ${r.run} (${r.service}) ends its last published trip ${r.last.tid} at ${r.last.dest} ${hms(r.end)}.`;
      r.leaves = later.length
        ? ev(L.POSSIBLE, `Leaves published passenger service at ${r.last.dest}. Another run (${later[0].run}) starts there ${fmtGap(later[0].start - r.end)} later, but GTFS doesn't link them`,
          [base, `Run ${later[0].run} begins ${later[0].first.tid} at ${r.last.dest} ${hms(later[0].start)}.`], {station: r.last.dest})
        : ev(L.CONFIRMED, `Run leaves published passenger service at ${r.last.dest} — onward movement unknown`,
          [base, `No published run starts at ${r.last.dest} within an hour after ${hm(r.end)} on ${r.service}.`], {station: r.last.dest});
      r.enters = ev(L.CONFIRMED, `Enters published passenger service at ${r.first.origin}${r.partway.starts ? " (partway along the line)" : ""}`,
        `First published trip ${r.first.tid} departs ${r.first.origin} ${hms(r.start)}.`, {station: r.first.origin});
    }
  }

  /* ---------- block_id ---------- */
  /** What block_id holds on this line, measured, never assumed (on CCL: loop workings inside a run). */
  function blockInfo(g) {
    const withB = g.trips.filter(t => t.block);
    if (!withB.length) return ev(L.CONFIRMED, "block_id is empty on every trip", `${g.trips.length} trips checked`);
    const runsPer = {};
    for (const t of withB) if (t.id.run != null) (runsPer[t.service + "|" + t.block] = runsPer[t.service + "|" + t.block] || new Set()).add(t.id.run);
    const across = Object.values(runsPer).filter(x => x.size > 1).length, blocks = Object.keys(runsPer).length;
    let same = 0, sameDir = 0, newRev = 0, newSame = 0;
    for (const r of g.runs) for (const k of r.links) {
      if (!k.from.block || !k.to.block) continue;
      const sb = k.from.block === k.to.block, sd = k.from.id.direction === k.to.id.direction;
      if (sb) { same++; if (sd) sameDir++; } else if (sd) newSame++; else newRev++;
    }
    const items = [ev(L.CONFIRMED, `block_id is set on ${withB.length} of ${g.trips.length} trips (${Math.round(withB.length / g.trips.length * 100)}%), in ${blocks} blocks; ${across} block(s) span more than one run`,
      `${withB.length} trips with block_id; blocks crossing runs: ${across}`)];
    if (same + newRev + newSame) items.push(ev(newSame === 0 && sameDir === same ? L.STRONG : L.POSSIBLE,
      "Inside a run, a block is a stretch of trips in one direction: it changes only where the train reverses",
      `consecutive trips in the same block: ${same} (same direction ${sameDir}); new block at a reversal: ${newRev}; new block without a reversal: ${newSame}`));
    items.push(ev(L.NONE, "block_id doesn't identify a physical train: it never names one, and it covers only part of each run", "no block spans runs, and trips without a block sit in the same runs"));
    return {items, withBlock: withB.length, blocks, across};
  }

  /* ---------- run classes ---------- */
  const H = h => h * 3600;
  /**
   * Approximate enthusiast duty code from the actual scheduled passenger trips.
   * LTA GTFS publishes trip timings, not the operator's FD/HD/peak duty roster.
   * The classifications below must never imply a confirmed depot movement.
   * Times are GTFS service-day seconds; 25:00 is the following day's 01:00.
   */
  function classifyDuty(run) {
    const trips = (run && Array.isArray(run.trips) ? run.trips : [])
      .filter(t => Number.isFinite(Number(t.dep)) && Number.isFinite(Number(t.arr)) && Number(t.arr) > Number(t.dep))
      .slice().sort((a, b) => Number(a.dep) - Number(b.dep));
    if (!trips.length) return {code: "Unclassified", start: null, end: null,
      evidence: ["No usable LTA scheduled passenger-trip times for this run."], source: "LTA timetable estimate"};
    const first = trips[0], last = trips.reduce((z, t) => Number(t.arr) > Number(z.arr) ? t : z, trips[0]);
    const start = Number(first.dep), end = Number(last.arr);
    const midday = trips.some(t => Number(t.dep) < H(15) && Number(t.arr) > H(11));
    // Singapore early-morning special trains may be 02:30 in a new service day,
    // or 26:30 on the previous service day. Treat both as late-night trips.
    // LN begins only when scheduled passenger service continues beyond 23:00
    // (or operates in the early hours of the next calendar day).
    const overnightStart = start < H(4.5);
    const lateNight = overnightStart || end > H(23);
    let code = "Unclassified";
    if (overnightStart && end <= H(6)) code = "LN";
    else if (start < H(10) && end >= H(18) && midday && trips.length >= 2) code = lateNight ? "FD LN" : "FD";
    else if (!overnightStart && start < H(10) && end <= H(11.5)) code = "(AM)";
    else if (!overnightStart && start < H(10) && end > H(11.5) && end <= H(16.5)) code = "HD";
    // An off-peak (around 11:00) injection continuing past 23:00 is OP LN,
    // not an afternoon-peak duty or an unclassified late-night run.
    else if (start >= H(10.25) && start <= H(12.5) && midday && end > H(23)) code = "OP LN";
    else if (start >= H(10.25) && start <= H(12.5) && end >= H(13.5) && end <= H(16.5)) code = "(OP)";
    else if (start >= H(13) && start < H(20.5) && end >= H(17)) code = lateNight ? "(PM) LN" : "(PM)";
    else if (lateNight) code = "LN";
    const evidence = [
      `${trips.length} LTA scheduled passenger trip(s), ${hm(start)} first departure to ${hm(end)} last arrival (GTFS service-day time).`,
      `Midday passenger coverage (11:00–15:00): ${midday ? "yes" : "not shown"}. Late-night coverage (scheduled passenger service beyond 23:00 or early-hours special): ${lateNight ? "yes" : "not shown"}.`,
      "Duty code is inferred from scheduled times, not an operator-issued roster, confirmed physical train identity or depot withdrawal."
    ];
    return {code, start, end, trips: trips.length, source: "LTA timetable estimate", evidence};
  }

  function classify(r) {
    const s = r.start, e = r.end, n = r.trips.length;
    let cls, what;
    if (s < H(10) && e <= H(13)) { cls = "MORNING PEAK"; what = "In service for the morning only"; }
    else if (s >= H(14) && s < H(20)) { cls = "EVENING PEAK"; what = e >= H(23) ? "Joins for the evening peak and stays until close" : "In service for the evening peak only"; }
    else if (s < H(10) && e >= H(20)) { cls = "ALL DAY"; what = "In service all day"; }
    else if (n <= 2) { cls = "SHORT WORKING"; what = "A short working (1–2 trips)"; }
    else { cls = "OTHER"; what = "Neither all-day nor a single peak"; }
    r.cls = cls;
    r.clsItem = ev(L.STRONG, what, `${n} trip${n === 1 ? "" : "s"}, first departs ${hms(s)}, last arrives ${hms(e)}. Classes: morning = starts before 10:00 and ends by 13:00; evening = starts 14:00–20:00; all day = starts before 10:00 and ends after 20:00`);
  }

  function summarise(r) {
    const c = {turnarounds: 0, continues: 0, missing: 0, overlaps: 0, jumps: 0, labels: {}};
    for (const k of r.links) {
      if (k.type === "turnaround") c.turnarounds++; else if (k.type === "continues") c.continues++;
      else if (k.type === "missing") c.missing++; else if (k.type === "overlap") c.overlaps++;
      if (k.jump) c.jumps++;
      for (const i of k.items) c.labels[i.label] = (c.labels[i.label] || 0) + 1;
    }
    const inferred = r.links.flatMap(k => k.items).filter(i => i.label !== L.CONFIRMED);
    c.confidence = !inferred.length ? L.CONFIRMED : inferred.some(i => i.label === L.POSSIBLE || i.label === L.NONE) ? L.POSSIBLE : L.STRONG;
    return c;
  }

  /* ---------- lookups for the app ---------- */
  function findTrip(G, code, tid, service) {
    const g = G && G.lines[code]; if (!g) return null;
    return g.trips.find(t => t.tid === tid && (!service || t.service === service)) || null;
  }
  /** The trip a run is on at time sec (seconds of the service day), or the last one before it. */
  function tripAt(run, sec) {
    let cur = null;
    for (const t of run.trips) { if (t.dep <= sec) cur = t; }
    return cur;
  }

  /* ---------- calendar: dated and special services ---------- */
  const ymd = d => d.replace(/-/g, "");
  const dateOf = s => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  const isoOf = d => d.toISOString().slice(0, 10);
  /** Which service_ids run on a date (YYYY-MM-DD), from calendar + calendar_dates. */
  function activeServices(TT, iso) {
    const d = ymd(iso), wd = (dateOf(d).getUTCDay() + 6) % 7, out = new Set();
    (TT.services || []).forEach((s, i) => { if (s[1][wd] === "1" && d >= s[2] && d <= s[3]) out.add(i); });
    for (const [i, type] of (TT.except || {})[d] || []) { if (type === 1) out.add(i); else out.delete(i); }
    return [...out].map(i => TT.services[i][0]);
  }
  /**
   * Services that only run for part of the year (dated changes such as SERVICE_WD_CCL_SPECIAL), found from the
   * calendar, never from their names: {id, lines, dates, replaces, diff}.
   */
  function specialServices(TT, G) {
    const svc = TT.services || [], out = [];
    const lineOf = id => Object.keys(TT.lines || {}).filter(c => (TT.lines[c].trips || []).some(t => (svc[t[2]] || [])[0] === id));
    svc.forEach((s, i) => {
      const span = (dateOf(s[3]) - dateOf(s[2])) / 864e5;
      const added = Object.entries(TT.except || {}).filter(([, a]) => a.some(([j, t]) => j === i && t === 1)).map(([d]) => d);
      if (span >= 120 && !added.length) return;
      // the dates it actually runs
      const dates = [];
      for (let d = dateOf(s[2]); d <= dateOf(s[3]); d = new Date(+d + 864e5)) {
        const iso = isoOf(d); if (activeServices(TT, iso).includes(s[0])) dates.push(iso);
      }
      for (const d of added) { const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`; if (!dates.includes(iso)) dates.push(iso); }
      dates.sort();
      const replaces = new Set();
      for (const iso of dates) for (const [j, t] of (TT.except || {})[ymd(iso)] || []) if (t === 2 && j !== i) replaces.add(svc[j][0]);
      // a regular service of the same day type on the same line that is NOT running that day
      const lines = lineOf(s[0]);
      const diff = {};
      for (const code of lines) {
        const g = G && G.lines[code]; if (!g) continue;
        const reg = [...replaces].find(id => g.trips.some(t => t.service === id));
        if (reg) diff[code] = compareServices(g, reg, s[0]);
      }
      out.push({id: s[0], days: s[1], from: s[2], to: s[3], lines, dates, replaces: [...replaces],
        item: ev(L.CONFIRMED, `${s[0]} runs on ${dates.length} date${dates.length === 1 ? "" : "s"} only${replaces.size ? `, in place of ${[...replaces].join(", ")}` : ""}`,
          [`calendar: ${s[1]} (Mon–Sun) from ${s[2]} to ${s[3]}`].concat(replaces.size ? [`calendar_dates removes ${[...replaces].join(", ")} on ${dates.join(", ")}`] : [])), diff});
    });
    return out;
  }
  /** How two services of one line differ: trips, runs, first and last times, from when they part. */
  function compareServices(g, a, b) {
    const A = g.trips.filter(t => t.service === a), B = g.trips.filter(t => t.service === b);
    const sig = t => `${t.dep}|${t.origin}|${t.dest}`;
    const sa = new Set(A.map(sig)), sb = new Set(B.map(sig));
    const onlyA = A.filter(t => !sb.has(sig(t))), onlyB = B.filter(t => !sa.has(sig(t)));
    const parts = Math.min(...onlyA.concat(onlyB).map(t => t.dep).concat([Infinity]));
    const pats = ts => { const m = {}; for (const t of ts) m[`${t.origin} → ${t.dest}`] = (m[`${t.origin} → ${t.dest}`] || 0) + 1; return m; };
    return {base: a, special: b, tripsBase: A.length, tripsSpecial: B.length, onlyBase: onlyA.length, onlySpecial: onlyB.length,
      differsFrom: Number.isFinite(parts) ? hm(parts) : null, patternsOnlyBase: pats(onlyA), patternsOnlySpecial: pats(onlyB),
      runsBase: new Set(A.map(t => t.id.run)).size, runsSpecial: new Set(B.map(t => t.id.run)).size};
  }

  /* ---------- feed summaries and what changed between two ---------- */
  function feedSummary(TT, G) {
    const s = {built: TT.feed && TT.feed.built || "", services: {}, except: TT.except || {}, lines: {}};
    for (const x of TT.services || []) s.services[x[0]] = `${x[1]} ${x[2]}-${x[3]}`;
    for (const [code, g] of Object.entries((G || build(TT)).lines)) {
      const per = {};
      for (const t of g.trips) {
        const p = per[t.service] || (per[t.service] = {trips: 0, runs: new Set(), first: Infinity, last: 0, routes: new Set()});
        p.trips++; if (t.id.run != null) p.runs.add(t.id.run);
        p.first = Math.min(p.first, t.dep); p.last = Math.max(p.last, t.arr);
        p.routes.add(t.route || `${t.origin}>${t.dest}`);
      }
      s.lines[code] = {};
      for (const [k, p] of Object.entries(per)) s.lines[code][k] = {trips: p.trips, runs: [...p.runs].sort(), first: hms(p.first), last: hms(p.last), routes: [...p.routes].sort()};
    }
    return s;
  }
  function diffFeeds(a, b) {
    const ch = [];
    const add = (kind, text, detail) => ch.push({kind, text, detail});
    for (const k of Object.keys(b.services)) if (!(k in a.services)) add("service-new", `New service ${k}`, b.services[k]);
    for (const k of Object.keys(a.services)) if (!(k in b.services)) add("service-removed", `Service ${k} removed`, a.services[k]);
    for (const k of Object.keys(b.services)) if (k in a.services && a.services[k] !== b.services[k]) add("service-changed", `Service ${k} calendar changed`, `${a.services[k]} → ${b.services[k]}`);
    if (JSON.stringify(a.except) !== JSON.stringify(b.except)) add("calendar-dates", "calendar_dates changed", `${Object.keys(a.except).length} → ${Object.keys(b.except).length} dates with exceptions`);
    for (const code of new Set(Object.keys(a.lines).concat(Object.keys(b.lines)))) {
      const A = a.lines[code] || {}, B = b.lines[code] || {};
      for (const svc of new Set(Object.keys(A).concat(Object.keys(B)))) {
        const x = A[svc], y = B[svc], w = `${code} ${svc}`;
        if (!x) { add("line-service-new", `${w}: new`, `${y.trips} trips, ${y.runs.length} runs`); continue; }
        if (!y) { add("line-service-removed", `${w}: removed`, `${x.trips} trips`); continue; }
        if (x.trips !== y.trips) add("trip-count", `${w}: trips ${x.trips} → ${y.trips}`);
        const ra = new Set(x.runs), rb = new Set(y.runs), newRuns = y.runs.filter(r => !ra.has(r)), goneRuns = x.runs.filter(r => !rb.has(r));
        if (newRuns.length || goneRuns.length) add("runs", `${w}: runs ${x.runs.length} → ${y.runs.length}`, `new ${newRuns.join(" ") || "none"}; removed ${goneRuns.join(" ") || "none"}`);
        if (x.first !== y.first) add("first-train", `${w}: first train ${x.first} → ${y.first}`);
        if (x.last !== y.last) add("last-train", `${w}: last arrival ${x.last} → ${y.last}`);
        const pa = new Set(x.routes), pb = new Set(y.routes), np = y.routes.filter(r => !pa.has(r)), gp = x.routes.filter(r => !pb.has(r));
        if (np.length || gp.length) add("routes", `${w}: route patterns changed`, `new ${np.join(", ") || "none"}; removed ${gp.join(", ") || "none"}`);
      }
    }
    return ch;
  }

  const api = {LABELS: L, parseTripId, tripsOf, build, buildLine, classifyDuty, findTrip, tripAt, activeServices, specialServices, compareServices,
    feedSummary, diffFeeds, hms, hm, clock, mins, fmtGap};
  root.mrtRunGraph = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

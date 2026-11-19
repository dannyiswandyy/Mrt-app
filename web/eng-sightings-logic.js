/* Engineering sightings: pure rules for the log of locomotives, works trains and test trains.
   No page, no map, no network. The clock is Singapore time (UTC+8), in minutes 0–1439.
   After hours is 01:00 inclusive until 05:30 exclusive. 05:30 through 00:59 is in service.
   sightingsAllowed is the production guard shared by the dev app, the normal app and the website.
   Works in the page (window.EngSightings) and in Node tests (module.exports). */
(function (root) {
  "use strict";

  const TYPES = [
    ["locomotive", "Locomotive"],
    ["engineering", "Engineering train"],
    ["test", "Test train"],
    ["other", "Other"]
  ];
  const TYPE_SET = {};
  for (let i = 0; i < TYPES.length; i++) TYPE_SET[TYPES[i][0]] = TYPES[i][1];
  const PHOTO_MAX = 360 * 1024;

  function pad(n) { return String(n).padStart(2, "0"); }
  function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim(); }

  /** True from 01:00 inclusive until 05:30 exclusive. */
  function isAfterHours(mins) {
    const n = Number(mins);
    if (!Number.isFinite(n)) return false;
    const m = ((Math.floor(n) % 1440) + 1440) % 1440;
    return m >= 60 && m < 330;
  }

  /** Wall clock in Singapore, whatever timezone the phone is set to. */
  function sgtNow(ms) {
    const t = Number.isFinite(ms) ? ms : Date.now();
    const d = new Date(t + 8 * 3600e3);
    const iso = d.toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 16), mins: d.getUTCHours() * 60 + d.getUTCMinutes() };
  }

  function sgtEpoch(date, time) {
    const parts = date.split("-").map(Number);
    const clock = time.split(":").map(Number);
    return Date.UTC(parts[0], parts[1] - 1, parts[2], clock[0] - 8, clock[1], 0, 0);
  }

  function parseDay(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value == null ? "" : value).trim());
    if (!m) return "";
    const y = +m[1], mo = +m[2], d = +m[3];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "";
    return m[1] + "-" + m[2] + "-" + m[3];
  }

  function parseClock(value) {
    const m = /^(\d{2}):(\d{2})$/.exec(String(value == null ? "" : value).trim());
    if (!m) return null;
    const h = +m[1], min = +m[2];
    if (h > 23 || min > 59) return null;
    return { time: m[1] + ":" + m[2], mins: h * 60 + min };
  }

  function cleanText(value, max) {
    return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function cleanToken(value, max) {
    const s = String(value == null ? "" : value).trim();
    if (!/^[A-Za-z0-9]+$/.test(s) || s.length > max) return "";
    return s;
  }

  function cleanId(value) {
    const s = String(value == null ? "" : value);
    return /^[A-Za-z0-9_-]{6,80}$/.test(s) ? s : "";
  }

  function newId(ms) {
    const t = (Number.isFinite(ms) ? ms : Date.now()).toString(36);
    return "es_" + t + "_" + Math.random().toString(36).slice(2, 8);
  }

  function cleanPhoto(value) {
    if (typeof value !== "string" || !value || value.length > PHOTO_MAX) return "";
    return /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value) ? value : "";
  }

  function asStop(x) {
    if (!x || typeof x !== "object") return null;
    const name = cleanText(x.name, 80);
    const code = cleanText(x.code, 12);
    if (!name) return null;
    return { name: name, code: code };
  }

  function stopLabel(stop) {
    return stop.code ? stop.name + " (" + stop.code + ")" : stop.name;
  }

  function normalizePlace(p) {
    if (!p || typeof p !== "object") return null;
    const between = p.mode === "between" || p.kind === "between" || p.from || Array.isArray(p.between);
    if (between) {
      const pair = Array.isArray(p.between) ? p.between : [p.from, p.to];
      const a = asStop(pair[0]);
      const b = asStop(pair[1]);
      if (!a || !b) return null;
      if (norm(a.name) === norm(b.name) && norm(a.code) === norm(b.code)) return null;
      return {
        mode: "between",
        from: a,
        to: b,
        names: [a.name, b.name],
        codes: [a.code, b.code],
        label: stopLabel(a) + " \u2013 " + stopLabel(b)
      };
    }
    const stop = asStop(p.station || p);
    if (!stop) return null;
    return {
      mode: "station",
      name: stop.name,
      code: stop.code,
      names: [stop.name],
      codes: stop.code ? [stop.code] : [],
      label: stopLabel(stop)
    };
  }

  /**
   * Build one sighting. afterHours is always taken from the clock, never from the caller.
   * date and time, when omitted together, are "now" in Singapore. nowMs is that instant.
   * Returns null when the type, line, place, date or time is no good.
   */
  function makeSighting(input, nowMs) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    if (!TYPE_SET[input.type]) return null;
    const line = cleanToken(input.line, 12);
    if (!line) return null;
    const place = normalizePlace(input.place);
    if (!place) return null;
    const clock = parseClock(input.time);
    const day = parseDay(input.date);
    const dateMissing = input.date == null || String(input.date).trim() === "";
    const timeMissing = input.time == null || String(input.time).trim() === "";
    let date, time, mins;
    if (clock && day) { date = day; time = clock.time; mins = clock.mins; }
    else if (dateMissing && timeMissing) {
      const n = sgtNow(nowMs);
      date = n.date; time = n.time; mins = n.mins;
    } else return null;
    const created = Number.isFinite(input.created) ? input.created : (Number.isFinite(nowMs) ? nowMs : Date.now());
    return {
      id: cleanId(input.id) || newId(nowMs),
      type: input.type,
      unit: cleanText(input.unit, 40),
      line: line,
      place: place,
      direction: cleanText(input.direction, 80),
      date: date,
      time: time,
      mins: mins,
      at: sgtEpoch(date, time),
      afterHours: isAfterHours(mins),
      note: cleanText(input.note, 800),
      photo: cleanPhoto(input.photo),
      created: created
    };
  }

  function stamp(s) {
    return [
      s && Number.isFinite(s.at) ? s.at : 0,
      s && Number.isFinite(s.created) ? s.created : 0
    ];
  }

  function sortNewest(list) {
    return (Array.isArray(list) ? list.slice() : []).sort(function (a, b) {
      const as = stamp(a), bs = stamp(b);
      if (bs[0] !== as[0]) return bs[0] - as[0];
      if (bs[1] !== as[1]) return bs[1] - as[1];
      return String(b && b.id || "").localeCompare(String(a && a.id || ""));
    });
  }

  function placeHay(s) {
    const p = s && s.place || {};
    return [p.label].concat(p.names || [], p.codes || []).join(" ");
  }

  /** Keep rows whose line, type and search match. q is matched against unit, place and note. */
  function filterSightings(list, opt) {
    const rows = Array.isArray(list) ? list : [];
    const o = opt || {};
    const line = o.line && String(o.line).toLowerCase() !== "all" ? String(o.line) : "";
    const type = o.type && String(o.type).toLowerCase() !== "all" ? String(o.type) : "";
    const q = norm(o.q);
    return rows.filter(function (s) {
      if (!s) return false;
      if (line && s.line !== line) return false;
      if (type && s.type !== type) return false;
      if (!q) return true;
      return norm([s.unit, placeHay(s), s.note].join(" ")).indexOf(q) !== -1;
    });
  }

  /** The newest n sightings at this station, or between two stations that include its name. */
  function recentAt(list, stationName, n) {
    const want = norm(stationName);
    if (!want) return [];
    const lim = n == null ? 3 : Math.max(0, Math.floor(Number(n)) || 0);
    if (!lim) return [];
    return sortNewest(list).filter(function (s) {
      const names = s && s.place && Array.isArray(s.place.names) ? s.place.names : [];
      for (let i = 0; i < names.length; i++) if (norm(names[i]) === want) return true;
      return false;
    }).slice(0, lim);
  }

  function toJSON(list) {
    const sightings = [];
    const rows = Array.isArray(list) ? list : [];
    for (let i = 0; i < rows.length; i++) {
      const s = makeSighting(rows[i]);
      if (s) sightings.push(s);
    }
    return JSON.stringify({ kind: "mrt-eng-sightings", version: 1, sightings: sightings });
  }

  /** Parse an export. Invalid JSON throws. A valid file keeps the good rows and drops the rest. */
  function fromJSON(text) {
    if (typeof text !== "string") throw new Error("Invalid JSON");
    let data;
    try { data = JSON.parse(text.replace(/^\uFEFF/, "").trim()); }
    catch (e) { throw new Error("Invalid JSON"); }
    let rows = null;
    if (Array.isArray(data)) rows = data;
    else if (data && typeof data === "object" && Array.isArray(data.sightings)) rows = data.sightings;
    else throw new Error("Invalid JSON");
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const s = makeSighting(rows[i]);
      if (s) out.push(s);
    }
    return out;
  }

  function csvCell(value) {
    const s = value == null ? "" : String(value);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /**
   * True only in the dev app. production must not be true, devFeatures must not be false,
   * and channel must be exactly "dev". Beta, the website, and a missing channel stay off.
   */
  function sightingsAllowed(flags) {
    const f = flags && typeof flags === "object" ? flags : {};
    return f.production !== true && f.devFeatures !== false && f.channel === "dev";
  }

  /** Text columns only. Photos stay out. Commas and quotes inside a field are escaped. */
  function toCSV(list) {
    const header = ["type", "unit", "line", "place", "direction", "date", "time", "afterHours", "note"];
    const lines = [header.join(",")];
    const rows = Array.isArray(list) ? list : [];
    for (let i = 0; i < rows.length; i++) {
      const s = rows[i];
      if (!s || !s.place) continue;
      const place = s.place.label || (s.place.names || []).join(" \u2013 ");
      lines.push([
        s.type, s.unit, s.line, place, s.direction, s.date, s.time,
        s.afterHours ? "yes" : "no", s.note
      ].map(csvCell).join(","));
    }
    return lines.join("\n") + "\n";
  }

  const api = {
    TYPES: TYPES,
    isAfterHours: isAfterHours,
    sgtNow: sgtNow,
    makeSighting: makeSighting,
    sortNewest: sortNewest,
    filterSightings: filterSightings,
    recentAt: recentAt,
    toJSON: toJSON,
    fromJSON: fromJSON,
    toCSV: toCSV,
    sightingsAllowed: sightingsAllowed
  };
  root.EngSightings = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

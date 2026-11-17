/* GTFS-Realtime captures for MRT Dev Diagnostics.
 *
 * Whenever LTA's GTFS-Realtime feed (trip updates or service alerts) holds at least one entity, the raw
 * response is kept (the latest 20), together with every field decoded from it. The point is evidence:
 * until a real capture shows LTA sending vehicle.id / vehicle.label / positions, the app must not present
 * any physical train identity or live location.
 *
 * Decoding follows the GTFS-Realtime spec (gtfs-realtime.proto) field numbers. Fields that aren't in the spec
 * (LTA extensions, if any) are listed under unknownFields with their path, wire type and a sample, so an
 * undocumented field can't go unnoticed.
 * Works in the page (window.mrtRtCapture) and in Node tests (globalThis.mrtRtCapture).
 */
(function (root) {
  "use strict";
  const KEY = "mrt.gtfsrt.captures.v1", SEEN = "mrt.gtfsrt.fields.v1", MAX = 20, RAW_MAX = 150000, ENT_MAX = 200, STU_MAX = 60;

  /* ---------- protobuf ---------- */
  function fields(b) {
    const out = []; let i = 0;
    const vint = () => { let x = 0n, s = 0n, c; do { c = b[i++]; x |= BigInt(c & 127) << s; s += 7n; } while (c & 128 && i < b.length); return x; };
    while (i < b.length) {
      const key = vint(), f = Number(key >> 3n), w = Number(key & 7n);
      let v;
      if (w === 0) v = vint();
      else if (w === 2) { const n = Number(vint()); v = b.subarray(i, i + n); i += n; }
      else if (w === 1) { v = b.subarray(i, i + 8); i += 8; }
      else if (w === 5) { v = b.subarray(i, i + 4); i += 4; }
      else throw new Error(`unsupported wire type ${w} at byte ${i}`);
      out.push({f, w, v});
    }
    return out;
  }
  const str = v => new TextDecoder().decode(v);
  const int = v => Number(BigInt.asIntN(64, v));
  const uint = v => Number(v);
  const f32 = v => new DataView(v.buffer, v.byteOffset, 4).getFloat32(0, true);
  const f64 = v => new DataView(v.buffer, v.byteOffset, 8).getFloat64(0, true);
  const enumOf = (names, v) => { const n = uint(v); return names[n] != null ? names[n] : n; };

  /* Schema: field number → [name, type, repeated?]. type = scalar kind or a message name. */
  const REL = ["SCHEDULED", "ADDED", "UNSCHEDULED", "CANCELED", "REPLACEMENT", "DUPLICATED", "DELETED", "NEW"];
  const STU_REL = ["SCHEDULED", "SKIPPED", "NO_DATA", "UNSCHEDULED"];
  const STATUS = ["INCOMING_AT", "STOPPED_AT", "IN_TRANSIT_TO"];
  const OCC = ["EMPTY", "MANY_SEATS_AVAILABLE", "FEW_SEATS_AVAILABLE", "STANDING_ROOM_ONLY", "CRUSHED_STANDING_ROOM_ONLY", "FULL", "NOT_ACCEPTING_PASSENGERS", "NO_DATA_AVAILABLE", "NOT_BOARDABLE"];
  const CAUSE = [null, "UNKNOWN_CAUSE", "OTHER_CAUSE", "TECHNICAL_PROBLEM", "STRIKE", "DEMONSTRATION", "ACCIDENT", "HOLIDAY", "WEATHER", "MAINTENANCE", "CONSTRUCTION", "POLICE_ACTIVITY", "MEDICAL_EMERGENCY"];
  const EFFECT = [null, "NO_SERVICE", "REDUCED_SERVICE", "SIGNIFICANT_DELAYS", "DETOUR", "ADDITIONAL_SERVICE", "MODIFIED_SERVICE", "OTHER_EFFECT", "UNKNOWN_EFFECT", "STOP_MOVED", "NO_EFFECT", "ACCESSIBILITY_ISSUE"];
  const S = {
    FeedMessage: {1: ["header", "FeedHeader"], 2: ["entity", "FeedEntity", true]},
    FeedHeader: {1: ["gtfs_realtime_version", "string"], 2: ["incrementality", "uint"], 3: ["timestamp", "uint"]},
    FeedEntity: {1: ["id", "string"], 2: ["is_deleted", "bool"], 3: ["trip_update", "TripUpdate"], 4: ["vehicle", "VehiclePosition"], 5: ["alert", "Alert"]},
    TripUpdate: {1: ["trip", "TripDescriptor"], 3: ["vehicle", "VehicleDescriptor"], 2: ["stop_time_update", "StopTimeUpdate", true], 4: ["timestamp", "uint"], 5: ["delay", "int"], 6: ["trip_properties", "TripProperties"]},
    TripDescriptor: {1: ["trip_id", "string"], 5: ["route_id", "string"], 6: ["direction_id", "uint"], 2: ["start_time", "string"], 3: ["start_date", "string"], 4: ["schedule_relationship", ["enum", REL]], 7: ["modified_trip", "bytes"]},
    VehicleDescriptor: {1: ["id", "string"], 2: ["label", "string"], 3: ["license_plate", "string"], 4: ["wheelchair_accessible", "uint"]},
    StopTimeUpdate: {1: ["stop_sequence", "uint"], 4: ["stop_id", "string"], 2: ["arrival", "StopTimeEvent"], 3: ["departure", "StopTimeEvent"], 5: ["schedule_relationship", ["enum", STU_REL]], 6: ["stop_time_properties", "bytes"]},
    StopTimeEvent: {1: ["delay", "int"], 2: ["time", "int"], 3: ["uncertainty", "int"]},
    TripProperties: {1: ["trip_id", "string"], 2: ["start_date", "string"], 3: ["start_time", "string"], 4: ["shape_id", "string"]},
    VehiclePosition: {1: ["trip", "TripDescriptor"], 8: ["vehicle", "VehicleDescriptor"], 2: ["position", "Position"], 3: ["current_stop_sequence", "uint"], 7: ["stop_id", "string"],
      4: ["current_status", ["enum", STATUS]], 5: ["timestamp", "uint"], 6: ["congestion_level", "uint"], 9: ["occupancy_status", ["enum", OCC]], 10: ["occupancy_percentage", "uint"], 11: ["multi_carriage_details", "CarriageDetails", true]},
    Position: {1: ["latitude", "float"], 2: ["longitude", "float"], 3: ["bearing", "float"], 4: ["odometer", "double"], 5: ["speed", "float"]},
    CarriageDetails: {1: ["id", "string"], 2: ["label", "string"], 3: ["occupancy_status", ["enum", OCC]], 4: ["occupancy_percentage", "int"], 5: ["carriage_sequence", "uint"]},
    Alert: {1: ["active_period", "TimeRange", true], 5: ["informed_entity", "EntitySelector", true], 6: ["cause", ["enum", CAUSE]], 7: ["effect", ["enum", EFFECT]], 8: ["url", "TranslatedString"],
      10: ["header_text", "TranslatedString"], 11: ["description_text", "TranslatedString"], 12: ["tts_header_text", "TranslatedString"], 13: ["tts_description_text", "TranslatedString"], 14: ["severity_level", "uint"]},
    TimeRange: {1: ["start", "uint"], 2: ["end", "uint"]},
    EntitySelector: {1: ["agency_id", "string"], 2: ["route_id", "string"], 3: ["route_type", "int"], 4: ["trip", "TripDescriptor"], 5: ["stop_id", "string"], 6: ["direction_id", "uint"]},
    TranslatedString: {1: ["translation", "Translation", true]},
    Translation: {1: ["text", "string"], 2: ["language", "string"]}
  };
  function scalar(type, x, path, unknown) {
    const {w, v} = x;
    if (Array.isArray(type)) return w === 0 ? enumOf(type[1], v) : (unknown.push({path, wire: w, note: "expected an enum"}), null);
    if (type === "string") return w === 2 ? str(v) : null;
    if (type === "bytes") return w === 2 ? `${v.length} bytes` : null;
    if (type === "bool") return w === 0 ? v !== 0n : null;
    if (type === "uint") return w === 0 ? uint(v) : null;
    if (type === "int") return w === 0 ? int(v) : null;
    if (type === "float") return w === 5 ? f32(v) : null;
    if (type === "double") return w === 1 ? f64(v) : null;
    return null;
  }
  /** Decodes a message by schema; fields not in the schema go to `unknown` with their path. */
  function decode(bytes, msg, path, unknown) {
    const spec = S[msg], out = {};
    for (const x of fields(bytes)) {
      const d = spec[x.f];
      if (!d) { unknown.push({path: `${path}.${x.f}`, wire: x.w, sample: sample(x)}); continue; }
      const [name, type, rep] = d;
      const val = typeof type === "string" && S[type] ? (x.w === 2 ? decode(x.v, type, `${path}.${name}`, unknown) : null) : scalar(type, x, `${path}.${name}`, unknown);
      if (rep) (out[name] = out[name] || []).push(val); else out[name] = val;
    }
    return out;
  }
  function sample(x) {
    if (x.w === 0) return String(x.v);
    if (x.w === 2) { try { const s = str(x.v); if (/^[\x20-\x7e]*$/.test(s)) return s.slice(0, 80); } catch (e) {} return `${x.v.length} bytes`; }
    if (x.w === 5) return `fixed32 ${f32(x.v)}`;
    if (x.w === 1) return `fixed64 ${f64(x.v)}`;
    return "?";
  }
  const b64bytes = b64 => { const bin = atob(b64), b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; };

  /** Every leaf path that carries a value, e.g. entity.trip_update.vehicle.id. */
  function paths(o, pre, set) {
    if (o == null || o === "") return set;
    if (Array.isArray(o)) { for (const x of o) paths(x, pre, set); return set; }
    if (typeof o === "object") { for (const [k, v] of Object.entries(o)) paths(v, pre ? `${pre}.${k}` : k, set); return set; }
    set.add(pre); return set;
  }

  /** Decodes one response (base64 of the protobuf) into a capture record; null when it can't be read. */
  function analyse(kind, b64, at) {
    let bytes, feed, unknown = [];
    try { bytes = b64bytes(b64); feed = decode(bytes, "FeedMessage", "feed", unknown); } catch (e) { return {at, kind, error: String(e && e.message || e), entityCount: 0}; }
    const ents = feed.entity || [];
    const text = t => t && t.translation ? t.translation.map(x => x.text).filter(Boolean).join(" / ") : "";
    const entities = ents.slice(0, ENT_MAX).map(e => {
      const tu = e.trip_update, vp = e.vehicle, al = e.alert, trip = (tu && tu.trip) || (vp && vp.trip) || {};
      const veh = (tu && tu.vehicle) || (vp && vp.vehicle) || null;
      const o = {id: e.id, type: tu ? "TripUpdate" : vp ? "VehiclePosition" : al ? "Alert" : "other",
        trip_id: trip.trip_id || null, route_id: trip.route_id || null, start_time: trip.start_time || null, start_date: trip.start_date || null,
        schedule_relationship: trip.schedule_relationship != null ? trip.schedule_relationship : null,
        vehicle: veh ? {id: veh.id || null, label: veh.label || null, license_plate: veh.license_plate || null} : null};
      if (tu) {
        o.delay = tu.delay != null ? tu.delay : null; o.timestamp = tu.timestamp || null;
        if (tu.trip_properties) o.trip_properties = tu.trip_properties;
        o.stop_time_update = (tu.stop_time_update || []).slice(0, STU_MAX).map(s => ({stop_sequence: s.stop_sequence, stop_id: s.stop_id,
          arrival: s.arrival || null, departure: s.departure || null, schedule_relationship: s.schedule_relationship || null}));
        o.stop_time_update_count = (tu.stop_time_update || []).length;
      }
      if (vp) Object.assign(o, {position: vp.position || null, current_stop_sequence: vp.current_stop_sequence, stop_id: vp.stop_id, current_status: vp.current_status,
        occupancy_status: vp.occupancy_status, occupancy_percentage: vp.occupancy_percentage, carriages: vp.multi_carriage_details || null, timestamp: vp.timestamp || null});
      if (al) o.alert = {cause: al.cause, effect: al.effect, header: text(al.header_text), description: text(al.description_text), url: text(al.url),
        active_period: al.active_period || [], informed_entity: al.informed_entity || []};
      return o;
    });
    const seen = [...paths({entity: ents}, "", new Set())].sort();
    return {at, kind, feedTimestamp: feed.header && feed.header.timestamp || null, version: feed.header && feed.header.gtfs_realtime_version || null,
      entityCount: ents.length, bytes: bytes.length, raw: b64.length <= RAW_MAX ? b64 : null, rawTruncated: b64.length > RAW_MAX,
      entities, entitiesTruncated: ents.length > ENT_MAX, fieldsPresent: seen, unknownFields: unknown.slice(0, 50)};
  }

  /* ---------- storage ---------- */
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  function list() { return store.get(KEY, []); }
  function save(cap) {
    let all = [cap].concat(list()).slice(0, MAX);
    // too big for storage: drop the raw copy from the oldest captures first, newest last
    for (let i = all.length - 1; i >= 0 && !store.set(KEY, all); i--) { if (all[i].raw) { all[i] = Object.assign({}, all[i], {raw: null, rawDropped: true}); } }
    const s = store.get(SEEN, {});
    for (const p of cap.fieldsPresent || []) { const x = s[p] || (s[p] = {count: 0, first: cap.at, example: null}); x.count++; x.last = cap.at; }
    for (const p of ["vehicle.id", "vehicle.label", "vehicle.license_plate"]) {
      const e = (cap.entities || []).find(x => x.vehicle && x.vehicle[p.split(".")[1]]);
      for (const k of Object.keys(s)) if (k.endsWith(p) && e && !s[k].example) s[k].example = e.vehicle[p.split(".")[1]];
    }
    store.set(SEEN, s);
  }
  /**
   * Called with every GTFS-Realtime response (kind: "trips" | "alerts", body: base64). Saves it when it holds at
   * least one entity, and logs that to Diagnostics. Returns the capture, or null.
   */
  function consider(kind, b64) {
    if (!b64) return null;
    const cap = analyse(kind, b64, Date.now());
    if (!cap || (!cap.entityCount && !cap.error)) return null;
    save(cap);
    try {
      const d = root.__mrtDiag;
      if (d) {
        const v = (cap.fieldsPresent || []).filter(p => /vehicle\.(id|label|license_plate)$|position\.(latitude|longitude)$/.test(p));
        d.push(cap.error ? "warn" : "info", "gtfs", cap.error ? `GTFS-Realtime ${kind} couldn't be decoded: ${cap.error}` :
          `GTFS-Realtime capture saved: ${kind}, ${cap.entityCount} entit${cap.entityCount === 1 ? "y" : "ies"}; identity fields ${v.length ? v.join(", ") : "none"}${cap.unknownFields.length ? `; ${cap.unknownFields.length} field(s) not in the GTFS-RT spec` : ""}`,
          {feedTimestamp: cap.feedTimestamp, bytes: cap.bytes, unknown: cap.unknownFields.slice(0, 5)});
      }
    } catch (e) {}
    return cap;
  }
  /** Has any capture ever carried a value at a path ending like this (e.g. "trip_update.vehicle.id")? */
  function seen(suffix) { return Object.entries(store.get(SEEN, {})).some(([k, v]) => k.endsWith(suffix) && v.count > 0); }

  /** Every place in the app's data that could identify a physical train, and what we actually know. */
  function identityReport() {
    const s = store.get(SEEN, {}), any = list().length;
    const st = suffix => {
      const hit = Object.entries(s).find(([k, v]) => k.endsWith(suffix) && v.count);
      return hit ? {status: "FIELD SEEN IN A REAL CAPTURE", detail: `${hit[1].count} capture(s); example ${hit[1].example != null ? hit[1].example : "(value kept in the capture)"}`}
        : {status: "FIELD EXISTS — UNVERIFIED", detail: any ? `in the GTFS-RT spec and decoded, but none of the ${any} saved capture(s) carried a value` : "in the GTFS-RT spec and decoded; no capture with any entity yet"};
    };
    return [
      Object.assign({field: "TripUpdate.vehicle.id (GTFS-RT)"}, st("trip_update.vehicle.id")),
      Object.assign({field: "TripUpdate.vehicle.label (GTFS-RT)"}, st("trip_update.vehicle.label")),
      Object.assign({field: "TripUpdate.vehicle.license_plate (GTFS-RT)"}, st("trip_update.vehicle.license_plate")),
      Object.assign({field: "VehiclePosition.vehicle / position (GTFS-RT)"}, st("vehicle.position.latitude"), {detail: "the app calls no VehiclePositions feed; decoded only if one turns up inside TripUpdates"}),
      Object.assign({field: "VehiclePosition.multi_carriage_details (car ids)"}, st("multi_carriage_details.id")),
      {field: "block_id (static GTFS trips.txt)", status: "FIELD EXISTS — NOT A TRAIN ID", detail: "empty on every line except CCL, where about half the trips carry it: a stretch of loop running inside one run, never across runs (see GTFS analysis → Train identity)"},
      {field: "Fleet number / trainset / car number / formation", status: "NO FIELD", detail: "not in any of LTA's 8 GTFS files nor in the GTFS-RT spec (except carriage ids above)"},
      {field: "Run number (trip_id)", status: "NOT A TRAINSET", detail: "a scheduled duty; GTFS doesn't say which train works it"}
    ];
  }

  const api = {decode: (b64) => decode(b64bytes(b64), "FeedMessage", "feed", []), analyse, consider, list, seen, identityReport, KEY, MAX};
  root.mrtRtCapture = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

/* MRT Spotter taxi availability: shared public/Dev data layer.
 * Live station cards are enabled only by MRT_DEV_FEATURES.
 * Source: LTA / data.gov.sg GeoJSON, refreshed roughly every 30 seconds.
 * Coordinates represent AVAILABLE taxis at a snapshot, not bookings, pickups, or vehicle tracking.
 */
(function(root){
  "use strict";
  const URL = "https://api.data.gov.sg/v1/transport/taxi-availability";
  const ONE_MIN = 60 * 1000;
  const MAX_AGE = 3 * ONE_MIN;
  const R_EARTH = 6371000;
  const ORIGIN_LAT = 1.352, ORIGIN_LON = 103.819;
  const KM_X = 111320 * Math.cos(ORIGIN_LAT * Math.PI / 180);
  const KM_Y = 111320;
  let snapshot = null, status = "idle", error = "", attempted = 0, pending = null;
  const summaryCache = new Map();
  const enabled = () => root.MRT_DEV_FEATURES === true && root.MRT_PRODUCTION !== true;
  const valid = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) &&
    lat > 1.1 && lat < 1.5 && lon > 103.55 && lon < 104.15;

  function parseGeoJSON(json) {
    if (!json || !Array.isArray(json.features)) throw Error("Invalid LTA taxi GeoJSON");
    const points = [];
    let timestamp = null;
    for (const feature of json.features) {
      if (!timestamp && feature && feature.properties && feature.properties.timestamp) {
        timestamp = Date.parse(feature.properties.timestamp);
      }
      const geo = feature && feature.geometry;
      const pairs = geo && geo.type === "MultiPoint" ? geo.coordinates :
        geo && geo.type === "Point" ? [geo.coordinates] : [];
      for (const pair of pairs || []) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const lon = Number(pair[0]), lat = Number(pair[1]);
        if (valid(lat, lon)) points.push([lon, lat]);
      }
    }
    if (!Number.isFinite(timestamp) || !timestamp) throw Error("Taxi snapshot has no valid timestamp");
    if (points.length > 100000) throw Error("Taxi snapshot unexpectedly large");
    return {points, timestamp, total: points.length};
  }

  function distanceMeters(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180;
    const dLat = (lat2-lat1)*rad, dLon=(lon2-lon1)*rad;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;
    return R_EARTH*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
  }

  function countNearby(station, points) {
    // SG Rail Data coordinates are metres east/south of central Singapore.
    const lat = ORIGIN_LAT - Number(station.y) / KM_Y;
    const lon = ORIGIN_LON + Number(station.x) / KM_X;
    if (!valid(lat,lon)) return null;
    let within500=0, within1000=0;
    for (const p of points) {
      const dist = distanceMeters(lat,lon,p[1],p[0]);
      if (dist <= 1000) {
        within1000++;
        if (dist <= 500) within500++;
      }
    }
    return {within500,within1000};
  }

  async function refresh(force) {
    if (!enabled()) return false;
    if (pending) return pending;
    if (!force && Date.now() - attempted < ONE_MIN) return status === "ready";
    if (root.document && root.document.hidden) return false;
    if (typeof root.nativeGet !== "function") {
      status = "error"; error = "Taxi data needs the Android network bridge.";
      return false;
    }
    attempted = Date.now(); status = snapshot ? "ready" : "loading"; error = "";
    pending = (async () => {
      try {
        const answer = await root.nativeGet(URL, false); // public data; no LTA key
        if (!answer || answer.code !== 200) throw Error("Data service responded " + (answer ? answer.code : "without a response"));
        const next = parseGeoJSON(JSON.parse(answer.body));
        if (next.timestamp > Date.now() + ONE_MIN) throw Error("Taxi snapshot timestamp is in the future");
        snapshot = next; status = "ready"; summaryCache.clear(); return true;
      } catch (e) {
        status = snapshot ? "ready" : "error";
        error = String(e && e.message || "Taxi data unavailable");
        return false;
      } finally {
        pending = null;
        if (root.mapInfo && typeof root.mapInfo === "function") {
          try { root.mapInfo(); } catch (_) {}
        }
      }
    })();
    return pending;
  }

  function stationHTML(station) {
    if (!enabled()) return "";
    if (station && typeof station.name === "string" && !pending) refresh(false);
    let line = "", stamp = "";
    const fresh = snapshot && Date.now() - snapshot.timestamp >= 0 &&
      Date.now() - snapshot.timestamp <= MAX_AGE;
    if (fresh) {
      let nearby = summaryCache.get(station.name);
      if (!nearby) {
        nearby = countNearby(station, snapshot.points);
        if (nearby) summaryCache.set(station.name, nearby);
      }
      line = nearby
        ? "<b>" + nearby.within500 + "</b> within 500 m · <b>" + nearby.within1000 + "</b> within 1 km"
        : "Station coordinates unavailable";
      stamp = "Snapshot " + new Date(snapshot.timestamp).toLocaleTimeString("en-SG", {timeZone:"Asia/Singapore",hour:"2-digit",minute:"2-digit",hour12:false}) + " SGT";
    } else if (status === "loading") line = "Checking nearby available taxis…";
    else if (snapshot) line = "Taxi snapshot is outdated; refresh to try again.";
    else if (status === "error") line = "Taxi availability unavailable right now.";
    else line = "Checking nearby available taxis…";

    return '<section class="mi-taxi"><div class="mi-taxi-head"><b>🚕 Available taxis nearby</b><span class="mi-taxi-beta">DEV TEST</span></div>' +
      '<div class="mi-taxi-count">' + line + '</div>' +
      '<div class="mi-taxi-foot"><small>' + (stamp || (error ? "Last request failed" : "LTA / data.gov.sg")) +
      ' · straight-line distance; not a pickup guarantee</small>' +
      '<button type="button" data-act="taxi-refresh"' + (pending ? ' disabled' : '') + '>Refresh</button></div></section>';
  }
  root.mrtTaxiAvailability = {
    enabled, stationHTML, refresh,
    parseGeoJSON, countNearby,
    state: () => ({status, error, timestamp:snapshot && snapshot.timestamp,
      count:snapshot && snapshot.total})
  };
})(typeof window !== "undefined" ? window : this);

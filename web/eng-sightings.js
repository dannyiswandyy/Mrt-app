/* Log of locomotive, engineering and test-train sightings.
   They have no public schedule. This screen never puts them on the map, and it never
   changes passenger trains, arrivals, or the train lists. Nothing is uploaded.
   The production app and website ship this module for code parity, but the production
   guard keeps it inert (same idea as ops-lab.js). */
(() => {
  const E = window.EngSightings;
  if (!E || typeof E.sightingsAllowed !== "function") return;

  // APP.getChannel() when the app bridge has it ("dev" or "beta"). Otherwise the page's
  // APP_CHANNEL ("dev", "beta", or "web"), and "web" when that is missing too.
  function pageChannel() {
    try {
      if (typeof APP !== "undefined" && APP && typeof APP.getChannel === "function") return APP.getChannel();
    } catch (e) {}
    try {
      if (typeof APP_CHANNEL === "string" && APP_CHANNEL !== "") return APP_CHANNEL;
    } catch (e) {}
    return "web";
  }

  if (!E.sightingsAllowed({
    production: window.MRT_PRODUCTION,
    devFeatures: window.MRT_DEV_FEATURES,
    channel: pageChannel()
  })) return;

  if (window.__engSightingsLoaded) return;
  window.__engSightingsLoaded = true;

  const DB_NAME = "mrt-eng-sightings";
  const STORE = "sightings";
  const LS_KEY = "mrt.engSightings";
  const PHOTO_LIMIT = 350 * 1024;

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const typeName = t => { const hit = E.TYPES.find(x => x[0] === t); return hit ? hit[1] : t; };
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const whenText = s => {
    const p = String(s.date || "").split("-");
    const d = +p[2], m = +p[1];
    if (!d || !m) return (s.date || "") + " " + (s.time || "") + " SGT";
    return d + " " + MON[m - 1] + " " + p[0] + " · " + s.time + " SGT";
  };
  const snippet = note => { const s = note || ""; return s.length <= 80 ? s : s.slice(0, 79) + "…"; };

  function lineKeys() {
    try { return Object.keys(LINES); }
    catch (e) { return []; }
  }
  function lineName(code) {
    try { return (LINES[code] && LINES[code].name) || code; }
    catch (e) { return code; }
  }
  function stationsOf(code) {
    try {
      const L = LINES[code];
      if (!L || !L.stations) return [];
      return L.stations.map(s => ({ code: s[0] || "", name: s[1] || "" })).filter(s => s.name);
    } catch (e) { return []; }
  }

  const style = document.createElement("style");
  style.textContent = `
#engBtn{position:relative}
#engMask{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.42);display:none;padding:clamp(8px,3vw,24px);box-sizing:border-box;overflow:auto;
  -webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}
#eng{max-width:720px;margin:2vh auto;background:var(--panel);color:var(--fg);border:1px solid var(--rule);border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,.42);overflow:hidden}
#eng .engHead{position:sticky;top:0;z-index:2;padding:14px 16px;background:var(--panel);border-bottom:1px solid var(--rule);display:flex;justify-content:space-between;align-items:center;gap:12px}
#eng h2{margin:0;font:700 20px/1.1 var(--display)}
#eng .engSub{margin:3px 0 0;color:var(--muted);font:500 12px var(--body)}
#eng .engX{background:var(--soft);color:var(--fg);border:1px solid var(--rule);width:40px;height:40px;border-radius:12px;font-size:22px;line-height:1;cursor:pointer;flex:0 0 auto}
#eng .engBody{padding:12px 16px 20px}
#eng .engLead{margin:0 0 10px;color:var(--muted);font:500 13px/1.4 var(--body)}
#eng .engFilters{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
#eng .engFilters input{grid-column:1/-1}
#eng select,#eng input[type=text],#eng input[type=search],#eng input[type=date],#eng input[type=time],#eng textarea{
  width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid var(--rule);border-radius:10px;background:var(--bg);color:var(--fg);font:600 14px var(--body);min-height:42px}
#eng textarea{font-weight:500;min-height:72px;resize:vertical}
#eng label{display:grid;gap:4px;font:700 12px var(--body);color:var(--muted)}
#eng .engGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#eng .engForm{margin:12px 0;padding:12px;border:1px solid var(--rule);border-radius:16px;background:var(--soft);display:grid;gap:8px}
#eng .engForm h3{margin:0;font:700 16px var(--display);color:var(--fg)}
#eng .engHint{margin:0;font:500 12px/1.4 var(--body);color:var(--muted)}
#eng .engRow{padding:10px 2px;border-bottom:1px solid var(--rule);display:grid;gap:3px}
#eng .engTop{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:baseline}
#eng .engType{font:800 14px var(--body)}
#eng .engUnit{font:700 13px var(--mono)}
#eng .engMeta{font:500 12.5px/1.4 var(--body);color:var(--muted)}
#eng .engWhen{font:700 13px var(--mono);font-variant-numeric:tabular-nums;color:var(--fg)}
#eng .engAh{display:inline-block;font:800 10px var(--body);letter-spacing:.04em;text-transform:uppercase;border-radius:6px;padding:2px 5px;background:var(--fg);color:var(--bg)}
#eng .engNote{margin:0;font:500 13px/1.35 var(--body)}
#eng .engShot{width:72px;height:54px;object-fit:cover;border-radius:8px;border:1px solid var(--rule);background:var(--bg)}
#eng .engActs{display:flex;gap:6px;margin-top:4px}
#eng .engActs button,#eng .engFoot button,#eng .engForm .engSave{border:1px solid var(--rule);border-radius:11px;padding:9px 12px;font:700 13px var(--body);background:var(--panel);color:var(--fg);cursor:pointer}
#eng .engFoot{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0}
#eng .engMsg{min-height:1.2em;margin:0 0 8px;font:600 12.5px var(--body);color:var(--muted)}
#eng .engEmpty{padding:18px 4px;color:var(--muted);text-align:center}
#eng .engPreview{display:flex;align-items:center;gap:8px}
#eng .engPreview img{width:72px;height:72px;object-fit:cover;border-radius:10px;border:1px solid var(--rule);background:var(--bg)}
.eng-stn{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.eng-stn li{font-size:13px;line-height:1.35}
.eng-stn small{color:var(--muted)}
@media(max-width:560px){#engMask{padding:6px}#eng{margin:0 auto;border-radius:18px}#eng .engGrid,#eng .engFilters{grid-template-columns:1fr}}
`;
  document.head.appendChild(style);

  const btn = document.createElement("button");
  btn.id = "engBtn";
  btn.type = "button";
  btn.setAttribute("aria-haspopup", "dialog");
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="9" width="11" height="7" rx="1.5"/><path d="M13 12h4l3 3v1h-7"/><circle cx="6.5" cy="18" r="1.4"/><circle cx="16.5" cy="18" r="1.4"/><path d="M5 9V7h6"/></svg>Engineering sightings<span>Locos and works trains</span>';
  const tiles = document.querySelector("#viewHome .tiles");
  if (tiles) tiles.appendChild(btn);

  const mask = document.createElement("div");
  mask.id = "engMask";
  mask.setAttribute("role", "presentation");
  mask.innerHTML = `<section id="eng" role="dialog" aria-modal="true" aria-labelledby="engTitle">
    <div class="engHead"><div><h2 id="engTitle">Sightings</h2><div class="engSub">Locomotives, engineering trains, test trains</div></div>
      <button type="button" class="engX" aria-label="Close">×</button></div>
    <div class="engBody">
      <p class="engLead">These are not passenger trains and they are not on the map.</p>
      <p class="engMsg" id="engMsg" role="status"></p>
      <div class="engFoot">
        <button type="button" id="engAdd">Log a sighting</button>
        <button type="button" id="engExportJson">Export JSON</button>
        <button type="button" id="engExportCsv">Export CSV</button>
        <button type="button" id="engImportBtn">Import JSON</button>
        <input id="engImport" type="file" accept="application/json,.json" hidden>
      </div>
      <div id="engForm" class="engForm" hidden>
        <h3 id="engFormTitle">Log a sighting</h3>
        <div class="engGrid">
          <label>Type<select id="engType"></select></label>
          <label>Unit<input id="engUnit" type="text" maxlength="40" placeholder="Optional unit or loco number" autocomplete="off"></label>
        </div>
        <label>Line<select id="engLine"></select></label>
        <label>Place<select id="engPlaceMode">
          <option value="station">At a station</option>
          <option value="between">Between two stations</option>
        </select></label>
        <label id="engStLab">Station<select id="engSt"></select></label>
        <div class="engGrid" id="engBetween" hidden>
          <label>From<select id="engFrom"></select></label>
          <label>To<select id="engTo"></select></label>
        </div>
        <label>Direction<input id="engDir" type="text" maxlength="80" placeholder="Optional, for example towards Jurong East" autocomplete="off"></label>
        <div class="engGrid">
          <label>Date (Singapore, UTC+8)<input id="engDate" type="date" required></label>
          <label>Time (Singapore, UTC+8)<input id="engTime" type="time" step="60" required></label>
        </div>
        <p class="engHint" id="engHours"></p>
        <label>Note<textarea id="engText" maxlength="800" placeholder="Optional"></textarea></label>
        <label>Photo<input id="engPhoto" type="file" accept="image/*" capture="environment"></label>
        <div class="engPreview" id="engPreview" hidden><img id="engImg" alt=""><button type="button" id="engPhotoClear">Remove photo</button></div>
        <div class="engActs"><button type="button" class="engSave" id="engSave">Save</button><button type="button" id="engCancel">Cancel</button></div>
      </div>
      <div class="engFilters">
        <select id="engLineF" aria-label="Filter by line"></select>
        <select id="engTypeF" aria-label="Filter by type"></select>
        <input id="engQ" type="search" placeholder="Search unit, place or note" aria-label="Search unit, place or note">
      </div>
      <div id="engList" aria-live="polite"></div>
    </div></section>`;
  document.body.appendChild(mask);

  const $ = id => document.getElementById(id);
  let list = [];
  let ready = false;
  let touched = false;
  let useLocal = false;
  let dbPromise = null;
  let editing = "";
  let draftPhoto = "";
  let opener = null;

  function say(text) { const el = $("engMsg"); if (el) el.textContent = text || ""; }

  function lineOptions(selected, withAll) {
    const keys = lineKeys();
    const all = withAll ? '<option value="all">All lines</option>' : "";
    return all + keys.map(k => `<option value="${esc(k)}"${k === selected ? " selected" : ""}>${esc(k)} · ${esc(lineName(k))}</option>`).join("");
  }
  function typeOptions(selected, withAll) {
    const all = withAll ? '<option value="all">All types</option>' : "";
    return all + E.TYPES.map(([v, label]) => `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(label)}</option>`).join("");
  }
  function stationOptions(code, selectedIndex) {
    return stationsOf(code).map((s, i) => `<option value="${i}"${i === selectedIndex ? " selected" : ""}>${esc(s.name)} (${esc(s.code)})</option>`).join("");
  }
  function indexOfStop(stops, name, code) {
    let i = stops.findIndex(s => s.name === name && s.code === code);
    if (i < 0) i = stops.findIndex(s => s.name === name);
    return i < 0 ? 0 : i;
  }

  function fillLineSelects() {
    const cur = $("engLine").value;
    const keys = lineKeys();
    const line = keys.indexOf(cur) >= 0 ? cur : (keys.indexOf("NSL") >= 0 ? "NSL" : (keys[0] || ""));
    $("engLine").innerHTML = lineOptions(line, false);
    if (line) $("engLine").value = line;
    const f = $("engLineF").value || "all";
    $("engLineF").innerHTML = lineOptions(f === "all" ? "" : f, true);
    $("engLineF").value = keys.indexOf(f) >= 0 || f === "all" ? f : "all";
    const tf = $("engTypeF").value || "all";
    $("engTypeF").innerHTML = typeOptions(tf === "all" ? "" : tf, true);
    $("engTypeF").value = tf || "all";
    const ty = $("engType").value || "locomotive";
    $("engType").innerHTML = typeOptions(ty, false);
    $("engType").value = ty;
    refillStations();
  }
  function refillStations(keep) {
    const code = $("engLine").value;
    const stops = stationsOf(code);
    let si = 0, fi = 0, ti = stops.length > 1 ? 1 : 0;
    if (keep) {
      si = indexOfStop(stops, keep.stationName, keep.stationCode);
      fi = indexOfStop(stops, keep.fromName, keep.fromCode);
      ti = indexOfStop(stops, keep.toName, keep.toCode);
    }
    $("engSt").innerHTML = stationOptions(code, si);
    $("engFrom").innerHTML = stationOptions(code, fi);
    $("engTo").innerHTML = stationOptions(code, ti);
    if ($("engSt").options.length) $("engSt").value = String(si);
    if ($("engFrom").options.length) $("engFrom").value = String(fi);
    if ($("engTo").options.length) $("engTo").value = String(ti);
  }
  function placeMode() {
    const between = $("engPlaceMode").value === "between";
    $("engBetween").hidden = !between;
    $("engStLab").hidden = between;
  }
  function hoursHint() {
    const clock = /^(\d{2}):(\d{2})$/.exec($("engTime").value || "");
    if (!clock) { $("engHours").textContent = "After hours is set from the clock: 01:00 up to 05:30 Singapore time. 05:30 through 00:59 is in service. There is no tick box."; return; }
    const m = (+clock[1]) * 60 + (+clock[2]);
    const on = E.isAfterHours(m);
    $("engHours").textContent = on
      ? "This time is after hours (01:00 up to 05:30, Singapore time). It is set from the clock, not a tick box."
      : "This time is in service. After hours is 01:00 up to 05:30, Singapore time, and 05:30 through 00:59 is in service. It is set from the clock, not a tick box.";
  }
  function showPreview() {
    const box = $("engPreview");
    if (!draftPhoto) { box.hidden = true; $("engImg").removeAttribute("src"); return; }
    $("engImg").src = draftPhoto;
    box.hidden = false;
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(r.error || new Error("photo"));
      r.readAsDataURL(file);
    });
  }
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("photo"));
      img.src = src;
    });
  }
  async function shrinkPhoto(file) {
    let src = "";
    try { src = await readFile(file); }
    catch (e) { return ""; }
    if (!/^data:image\//.test(src)) return "";
    let img;
    try { img = await loadImage(src); }
    catch (e) { return ""; }
    const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
    if (!nw || !nh) return "";
    const fit = Math.min(1, 960 / Math.max(nw, nh));
    let w = Math.max(1, Math.round(nw * fit)), h = Math.max(1, Math.round(nh * fit));
    const canvas = document.createElement("canvas");
    const paint = quality => {
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return "";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      try { return canvas.toDataURL("image/jpeg", quality); }
      catch (e) { return ""; }
    };
    let quality = 0.7;
    let data = paint(quality);
    while (data && data.length > PHOTO_LIMIT && quality > 0.35) {
      quality = Math.round((quality - 0.08) * 100) / 100;
      data = paint(quality);
    }
    while (data && data.length > PHOTO_LIMIT && Math.max(w, h) > 320) {
      w = Math.max(1, Math.round(w * 0.8));
      h = Math.max(1, Math.round(h * 0.8));
      quality = 0.6;
      data = paint(quality);
      while (data && data.length > PHOTO_LIMIT && quality > 0.35) {
        quality = Math.round((quality - 0.08) * 100) / 100;
        data = paint(quality);
      }
    }
    if (!data || data.length > PHOTO_LIMIT || !/^data:image\/jpeg;base64,/.test(data)) return "";
    return data;
  }

  function render() {
    const box = $("engList");
    if (!box) return;
    if (!ready) { box.innerHTML = '<div class="engEmpty">Opening the log saved on this device…</div>'; return; }
    const rows = E.sortNewest(E.filterSightings(list, {
      line: $("engLineF").value,
      type: $("engTypeF").value,
      q: $("engQ").value
    }));
    if (!rows.length) {
      box.innerHTML = '<div class="engEmpty">' + (list.length ? "No sightings match." : "No sightings logged yet.") + "</div>";
      return;
    }
    box.innerHTML = rows.map(s => {
      const bits = [s.line, s.place && s.place.label, s.direction].filter(Boolean).map(esc);
      return `<article class="engRow" data-id="${esc(s.id)}">
        <div class="engTop"><span class="engType">${esc(typeName(s.type))}</span>${s.unit ? `<span class="engUnit">${esc(s.unit)}</span>` : ""}<span class="engWhen">${esc(whenText(s))}</span>${s.afterHours ? '<span class="engAh">After hours</span>' : ""}</div>
        <div class="engMeta">${bits.join(" · ")}</div>
        ${s.note ? `<p class="engNote">${esc(snippet(s.note))}</p>` : ""}
        ${s.photo ? `<img class="engShot" alt="" src="${esc(s.photo)}">` : ""}
        <div class="engActs"><button type="button" data-eng="edit" data-id="${esc(s.id)}">Edit</button><button type="button" data-eng="del" data-id="${esc(s.id)}">Delete</button></div>
      </article>`;
    }).join("");
  }

  function openDb() {
    if (!window.indexedDB) return Promise.reject(new Error("no indexedDB"));
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, 1); }
      catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("indexedDB"));
      req.onblocked = () => reject(new Error("indexedDB blocked"));
    });
  }
  function db() {
    if (!dbPromise) dbPromise = openDb().catch(err => { dbPromise = null; throw err; });
    return dbPromise;
  }
  function txDone(database, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let request;
      try { request = fn(store); }
      catch (e) { reject(e); return; }
      tx.oncomplete = () => resolve(request && request.result);
      tx.onerror = () => reject(tx.error || new Error("indexedDB"));
      tx.onabort = () => reject(tx.error || new Error("indexedDB"));
    });
  }
  function readLocal() {
    try { return E.fromJSON(localStorage.getItem(LS_KEY) || ""); }
    catch (e) { return []; }
  }
  function writeLocal() {
    const slim = list.map(s => { const c = Object.assign({}, s); c.photo = ""; return c; });
    try { localStorage.setItem(LS_KEY, E.toJSON(slim)); }
    catch (e) { say("Couldn't save the log on this device."); }
  }
  async function idbAll() {
    const database = await db();
    return txDone(database, "readonly", store => store.getAll());
  }
  async function idbPut(row) {
    const database = await db();
    await txDone(database, "readwrite", store => store.put(row));
  }
  async function idbDelete(id) {
    const database = await db();
    await txDone(database, "readwrite", store => store.delete(id));
  }
  function remember(row) {
    const i = list.findIndex(s => s.id === row.id);
    if (i >= 0) list[i] = row;
    else list.push(row);
  }
  async function persistRow(row) {
    touched = true;
    remember(row);
    if (useLocal) { writeLocal(); return; }
    try {
      await idbPut(row);
    } catch (e) {
      if (row.photo) {
        try {
          const slim = Object.assign({}, row, { photo: "" });
          await idbPut(slim);
          remember(slim);
          say("Saved without the photo. This device wouldn't store the picture.");
          return;
        } catch (e2) {}
      }
      useLocal = true;
      dbPromise = null;
      writeLocal();
      say("Saved on this device without photos. The sightings database couldn't be used.");
    }
  }
  async function persistAll() {
    touched = true;
    if (useLocal) { writeLocal(); return; }
    try {
      for (let i = 0; i < list.length; i++) await idbPut(list[i]);
    } catch (e) {
      useLocal = true;
      dbPromise = null;
      writeLocal();
      say("Saved on this device without photos. The sightings database couldn't be used.");
    }
  }
  async function load() {
    try {
      const rows = await idbAll();
      const fromDb = (rows || []).map(r => E.makeSighting(r)).filter(Boolean);
      const local = readLocal();
      const map = new Map();
      for (let i = 0; i < fromDb.length; i++) map.set(fromDb[i].id, fromDb[i]);
      const missing = [];
      for (let i = 0; i < local.length; i++) if (!map.has(local[i].id)) { map.set(local[i].id, local[i]); missing.push(local[i]); }
      if (!touched) {
        list = [...map.values()];
        for (let i = 0; i < missing.length && !touched; i++) await idbPut(missing[i]);
        if (!touched) {
          try { localStorage.removeItem(LS_KEY); } catch (e2) {}
          useLocal = false;
        }
      }
    } catch (e) {
      useLocal = true;
      dbPromise = null;
      if (!touched) list = readLocal();
    }
    ready = true;
    render();
    refreshStation();
  }

  // Share sheet via shareLogFile when the app has it (large files). A download otherwise.
  // MrtApp.share stops at 200000 characters, so this log does not call it.
  function handOff(name, text) {
    const A = window.MrtApp;
    if (A && typeof A.shareLogFile === "function") {
      try { if (A.shareLogFile(name, text)) return "shared"; }
      catch (e) {}
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return "downloaded";
  }

  function closeForm() {
    editing = "";
    draftPhoto = "";
    $("engForm").hidden = true;
    $("engPhoto").value = "";
    showPreview();
  }
  function openForm(existing) {
    fillLineSelects();
    const now = E.sgtNow();
    $("engFormTitle").textContent = existing ? "Edit sighting" : "Log a sighting";
    $("engType").value = existing ? existing.type : "locomotive";
    $("engUnit").value = existing ? existing.unit : "";
    $("engDir").value = existing ? existing.direction : "";
    $("engText").value = existing ? existing.note : "";
    $("engDate").value = existing ? existing.date : now.date;
    $("engTime").value = existing ? existing.time : now.time;
    const keys = lineKeys();
    const line = existing && keys.indexOf(existing.line) >= 0 ? existing.line : (keys.indexOf("NSL") >= 0 ? "NSL" : (keys[0] || ""));
    if (line) $("engLine").value = line;
    const place = existing && existing.place;
    if (place && place.mode === "between") {
      $("engPlaceMode").value = "between";
      refillStations({
        fromName: place.from && place.from.name, fromCode: place.from && place.from.code,
        toName: place.to && place.to.name, toCode: place.to && place.to.code
      });
    } else {
      $("engPlaceMode").value = "station";
      refillStations({ stationName: place && place.name, stationCode: place && place.code });
    }
    placeMode();
    draftPhoto = existing && existing.photo || "";
    showPreview();
    hoursHint();
    editing = existing ? existing.id : "";
    $("engForm").hidden = false;
    $("engType").focus();
  }
  function chosenPlace() {
    const code = $("engLine").value;
    const stops = stationsOf(code);
    if ($("engPlaceMode").value === "between") {
      const a = stops[+$("engFrom").value], b = stops[+$("engTo").value];
      if (!a || !b) return { error: "Pick two stations on this line." };
      if (a.name === b.name && a.code === b.code) return { error: "Pick two different stations." };
      return { place: { mode: "between", from: { name: a.name, code: a.code }, to: { name: b.name, code: b.code } } };
    }
    const a = stops[+$("engSt").value];
    if (!a) return { error: "Pick a station on this line." };
    return { place: { mode: "station", name: a.name, code: a.code } };
  }
  async function saveForm() {
    const picked = chosenPlace();
    if (picked.error) { say(picked.error); return; }
    const prev = editing ? list.find(s => s.id === editing) : null;
    const row = E.makeSighting({
      id: editing || undefined,
      created: prev ? prev.created : Date.now(),
      type: $("engType").value,
      unit: $("engUnit").value,
      line: $("engLine").value,
      place: picked.place,
      direction: $("engDir").value,
      date: $("engDate").value,
      time: $("engTime").value,
      note: $("engText").value,
      photo: draftPhoto
    });
    if (!row) { say("Check the type, line, place, date and time."); return; }
    await persistRow(row);
    closeForm();
    if (!$("engMsg").textContent) say("Saved on this device.");
    render();
    refreshStation();
  }
  async function removeRow(id) {
    if (!confirm("Delete this sighting?")) return;
    touched = true;
    list = list.filter(s => s.id !== id);
    if (useLocal) writeLocal();
    else {
      try { await idbDelete(id); }
      catch (e) { useLocal = true; dbPromise = null; writeLocal(); }
    }
    if (editing === id) closeForm();
    say("Deleted.");
    render();
    refreshStation();
  }

  window.engSightingsHTML = function (name) {
    const rows = E.recentAt(list, name, 3);
    if (!rows.length) return "";
    const items = rows.map(s => `<li><b>${esc(typeName(s.type))}</b>${s.unit ? " " + esc(s.unit) : ""} · ${esc(s.line)} · ${esc(s.place && s.place.label || "")} · ${esc(whenText(s))}${s.afterHours ? ' <span class="sb">after hours</span>' : ""}${s.note ? `<br><small>${esc(snippet(s.note))}</small>` : ""}</li>`).join("");
    return `<div class="ex-sec" id="engRecent"><p class="hsub">Recent sightings</p><ul class="eng-stn">${items}</ul><p class="ex-src">Logged on this device. Not a passenger train and not on the map.</p></div>`;
  };
  function refreshStation() {
    try {
      const title = $("hxTitle"), stat = $("hxStatic"), sheet = $("hxSheet");
      if (!title || !stat || !sheet || sheet.hidden) return;
      if (!stat.querySelector("[data-hx=cam]")) return;
      const name = title.textContent.trim();
      if (!name) return;
      const html = window.engSightingsHTML(name);
      const box = stat.querySelector("#engRecent");
      if (!html) { if (box) box.remove(); return; }
      if (box) { box.outerHTML = html; return; }
      const actions = stat.querySelector(":scope > .mi-act");
      if (actions) actions.insertAdjacentHTML("beforebegin", html);
      else stat.insertAdjacentHTML("beforeend", html);
    } catch (e) {}
  }

  function open() {
    opener = document.activeElement;
    mask.style.display = "block";
    document.body.style.overflow = "hidden";
    fillLineSelects();
    render();
    const x = mask.querySelector(".engX");
    if (x) x.focus();
  }
  function close() {
    closeForm();
    mask.style.display = "none";
    document.body.style.overflow = "";
    if (opener && opener.focus) opener.focus();
  }

  btn.addEventListener("click", open);
  mask.querySelector(".engX").addEventListener("click", close);
  mask.addEventListener("click", e => { if (e.target === mask) close(); });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || mask.style.display !== "block") return;
    e.preventDefault();
    e.stopPropagation();
    if (!$("engForm").hidden) { closeForm(); return; }
    close();
  }, true);
  $("engAdd").addEventListener("click", () => openForm(null));
  $("engCancel").addEventListener("click", closeForm);
  $("engSave").addEventListener("click", () => { saveForm(); });
  $("engPlaceMode").addEventListener("change", placeMode);
  $("engLine").addEventListener("change", () => refillStations());
  $("engTime").addEventListener("input", hoursHint);
  $("engDate").addEventListener("input", hoursHint);
  $("engLineF").addEventListener("change", render);
  $("engTypeF").addEventListener("change", render);
  $("engQ").addEventListener("input", render);
  $("engList").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    const id = b.getAttribute("data-id");
    if (b.getAttribute("data-eng") === "edit") {
      const row = list.find(s => s.id === id);
      if (row) openForm(row);
    } else if (b.getAttribute("data-eng") === "del") removeRow(id);
  });
  $("engPhotoClear").addEventListener("click", () => { draftPhoto = ""; $("engPhoto").value = ""; showPreview(); });
  $("engPhoto").addEventListener("change", async () => {
    const file = $("engPhoto").files && $("engPhoto").files[0];
    $("engPhoto").value = "";
    if (!file) return;
    if (file.type && !/^image\//.test(file.type)) { say("Choose a photo."); return; }
    const data = await shrinkPhoto(file);
    if (!data) { say("That photo couldn't be kept small enough, so it wasn't stored."); return; }
    draftPhoto = data;
    showPreview();
    say("");
  });
  $("engExportJson").addEventListener("click", () => {
    const text = E.toJSON(E.sortNewest(list));
    handOff("eng-sightings.json", text);
  });
  $("engExportCsv").addEventListener("click", () => {
    handOff("eng-sightings.csv", E.toCSV(E.sortNewest(list)));
  });
  $("engImportBtn").addEventListener("click", () => $("engImport").click());
  $("engImport").addEventListener("change", async () => {
    const file = $("engImport").files && $("engImport").files[0];
    $("engImport").value = "";
    if (!file) return;
    let text = "";
    try { text = await file.text(); }
    catch (e) { say("That file isn't valid JSON. Nothing was imported."); return; }
    let rows;
    try { rows = E.fromJSON(text); }
    catch (e) { say("That file isn't valid JSON. Nothing was imported."); return; }
    if (!rows.length) { say("No sightings in that file."); return; }
    const map = new Map(list.map(s => [s.id, s]));
    for (let i = 0; i < rows.length; i++) map.set(rows[i].id, rows[i]);
    list = E.sortNewest([...map.values()]);
    await persistAll();
    say("Imported " + rows.length + (rows.length === 1 ? " sighting." : " sightings."));
    render();
    refreshStation();
  });

  fillLineSelects();
  load();
})();

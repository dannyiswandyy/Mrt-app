/* ---------- MRT Tracker website: stand-in for the Android app's bridge ----------
   The phone app gives this page window.MrtApp (LTA data with the app's key, news, the timetable, buildings
   and track shapes packed into the app). On the website:
   * the timetable, buildings, RTS Link / Sentosa Express tracks and station exits come from data/ next to this page
     (made when the site is deployed);
   * LTA alerts and crowds, rail news and the Live cam lookup go through the data relay set in config.js
     (a Cloudflare Worker that holds the LTA key; the key is never in this site). Without it, train times
     are estimates from the timetable and the page says live data is unavailable;
   * NEA weather goes through the relay too when there is one (shared and cached), otherwise straight to
     data.gov.sg, which allows it;
   * what only the phone app can do (in-app updates, saving LTA's timetable file, the home-screen widget,
     Android notifications and trip alarms) is left out, so the page hides those buttons;
   * sharing the spotter's log uses the browser's share sheet when it has one; otherwise the page copies
     the text itself. Online/offline follows the browser. */
(() => {
  const C = window.MRT_WEB_CONFIG || {}, PROXY = String(C.proxy || "").trim().replace(/\/+$/, "");
  const W = window.MRT_WEB = {proxy: PROXY, relay: false, live: false, ai: false, yt: false, build: "__BUILD__"};
  const within = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
  const getText = (u, ms) => within(fetch(u, {cache: "no-cache"}).then(r => r.ok ? r.text() : null).catch(() => null), ms);
  const reply = (id, code, body) => setTimeout(() => { if (window.__native) window.__native(id, code, body || ""); }, 0);
  const send = (id, url, opt) => fetch(url, opt).then(async r => reply(id, r.status, await r.text())).catch(() => reply(id, 0, ""));

  /* Where each request the page makes goes on the website (null: not available). */
  function route(url){
    let u; try { u = new URL(url); } catch(e){ return null; }
    if (u.protocol !== "https:") return null;
    if (u.hostname === "api-open.data.gov.sg" && u.pathname.startsWith("/v2/real-time/api/"))      // via the relay (shared, cached), else directly
      return W.relay ? PROXY + "/wx/" + u.pathname.slice("/v2/real-time/api/".length) + u.search : u.href;
    if (!W.live) return null;
    if (u.hostname === "datamall2.mytransport.sg" && u.pathname.startsWith("/ltaodataservice/")) return PROXY + "/lta/" + u.pathname.slice("/ltaodataservice/".length) + u.search;
    if (u.hostname === "news.google.com" && u.pathname === "/rss/search") return PROXY + "/news" + u.search;
    return null;
  }

  let tt = "", bld = "", trk = "", ex = "";
  const bridge = {
    getChannel: () => "beta",                      // the normal MRT Tracker, not MRT Dev
    getVersion: () => W.build,
    getTimetable: () => tt,
    getBuildings: () => bld,
    getTracks: () => trk,                          // "" if this deploy has none; the page then draws those two lines straight
    getExits: () => ex,                            // "" if this deploy has none; station pages then list no exits
    hasKey: () => W.live,
    builtInKey: () => W.live,
    hasAi: () => W.ai,
    isOnline: () => navigator.onLine !== false,
    fetch(id, url){
      const to = route(url);
      if (!to){ reply(id, 0, ""); return; }
      send(id, to, {headers: {Accept: "application/json, application/rss+xml, text/xml"}});
    },
    askAi(id, request){
      if (!W.ai){ reply(id, 0, ""); return; }
      send(id, PROXY + "/ai", {method: "POST", headers: {"content-type": "application/json"}, body: request});
    }
  };
  if (navigator.share){
    bridge.share = (text) => {
      if (text == null) return;
      navigator.share({title: "My MRT Spotter's log", text: String(text)}).catch(() => {});
    };
  }

  const health = PROXY ? within(fetch(PROXY + "/health", {cache: "no-store"}).then(r => r.ok ? r.json() : null).catch(() => null), 4000) : Promise.resolve(null);
  Promise.all([getText("data/timetable.json", 8000), getText("data/tracks.json", 8000), getText("data/exits.json", 8000), health]).then(([t, tr, x, h]) => {
    tt = t && t.trim().startsWith("{") && t.includes('"lines"') ? t : "";
    trk = tr && tr.trim().startsWith("{") && tr.includes('"paths"') ? tr : "";
    ex = x && x.trim().startsWith("{") ? x : "";
    if (h && h.ok){ W.relay = true; W.live = !!h.lta; W.ai = !!h.ai; W.yt = !!h.yt; }
    if (W.yt) bridge.liveLookup = (id, handle) => send(id, PROXY + "/yt?handle=" + encodeURIComponent(handle));
    window.MrtApp = bridge;

    // the app's own script, once the whole page is in (the app's script reads the page as it starts)
    const start = () => {
      const src = document.getElementById("mrt-main"), s = document.createElement("script");
      s.textContent = src.textContent;
      src.remove();
      document.body.appendChild(s);
      later();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once: true}); else start();
  });

  function later(){

    // buildings are big: they load after the map is up, then show
    getText("data/buildings.json", 60000).then(b => {
      if (!b || !b.trim().startsWith("{") || !b.includes('"b"')) return;
      bld = b;
      try { bldRaw = b; BLD = null; sync3d(); mDirty = true; } catch(e){}
    });

    // the app calls these when it's opened or put away
    document.addEventListener("visibilitychange", () => {
      try { if (document.hidden){ if (window.appPause) appPause(); } else if (window.appResume) appResume(); } catch(e){}
    });
    // the browser's back button closes an open card first, like Android's back button in the app
    let armed = false;
    const arm = () => { if (armed) return; armed = true; history.pushState({mrt: 1}, ""); };
    addEventListener("pointerdown", arm, {once: true, capture: true});
    addEventListener("popstate", () => {
      let used = false; try { used = !!(window.appBack && appBack()); } catch(e){}
      if (used) history.pushState({mrt: 1}, ""); else { armed = false; history.back(); }
    });

    // offline start
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();

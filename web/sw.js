/* MRT Tracker website: offline start + Trip Reminder push notifications.
   The page and its own files are fetched fresh when there's a connection and kept, so the site still opens
   offline (with timetable estimates). Other sites (map tiles, fonts, LTA via the relay, YouTube) are never stored here. */
const CACHE = "mrt-web-v5";
const SHELL = [
  "./",
  "index.html",
  "config.js",
  "trip-reminders.js",
  "mrt-insights.js",
  "fleet-dex.js",
  "livecam.html",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "fonts/LTAIdentity-Medium.woff2"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(r).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(r, copy));
      }
      return res;
    }).catch(() => caches.match(r).then(m => m || (r.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});

function showTripNotification(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  const title = String(data.title || "MRT Spotter · Trip Reminder");
  const options = {
    body: String(data.body || "Your train is approaching the next station."),
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: String(data.tag || "mrt-trip-reminder"),
    renotify: true,
    requireInteraction: data.kind === "transfer" || data.kind === "destination",
    vibrate: data.kind === "destination" ? [220, 100, 220, 100, 260] : [160, 80, 160],
    data: {
      url: data.url || "./",
      kind: data.kind || "station",
      line: data.line || "",
      stationCode: data.stationCode || "",
      stationName: data.stationName || "",
      tripKey: data.tripKey || ""
    },
    actions: [
      { action: "view", title: "Open trip" },
      { action: "stop", title: "Stop reminders" }
    ]
  };
  return self.registration.showNotification(title, options);
}

/* Server-sent Web Push notifications */
self.addEventListener("push", e => {
  let payload = {};
  try {
    payload = e.data ? e.data.json() : {};
  } catch (_) {
    payload = { body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(showTripNotification(payload));
});

/* Direct notification dispatch from the page (used when no push relay is running) */
self.addEventListener("message", e => {
  const msg = e.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "TRIP_REMINDER_NOTIFY" && msg.payload) {
    e.waitUntil(showTripNotification(msg.payload));
  }
});

/* Clicking a notification or its action buttons */
self.addEventListener("notificationclick", e => {
  const action = e.action || "view";
  const info = (e.notification && e.notification.data) || {};
  e.notification.close();

  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        try {
          client.postMessage({ type: "TRIP_REMINDER_ACTION", action, data: info });
        } catch (_) {}
        if (action !== "stop" && "focus" in client) return client.focus();
      }
      if (action !== "stop" && self.clients.openWindow) {
        return self.clients.openWindow(info.url || "./");
      }
      return undefined;
    })
  );
});

"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const webpush = require("web-push");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

const webDir = path.join(__dirname, "web");
const dataDir = path.join(__dirname, "data");
const webDataDir = path.join(webDir, "data");

app.use(express.json({ limit: "64kb" }));

/* ---------- Web Push (VAPID) for Trip Reminders ---------- */
const vapidKeys =
  process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
    : webpush.generateVAPIDKeys();
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:alerts@mrtspotter.local";
webpush.setVapidDetails(vapidSubject, vapidKeys.publicKey, vapidKeys.privateKey);

const subscriptions = new Map(); // clientId -> PushSubscription
const scheduledTimers = new Map(); // clientId -> Timeout[]

function validClientId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{4,64}$/.test(id);
}

function validSubscription(sub) {
  return !!(
    sub &&
    typeof sub === "object" &&
    typeof sub.endpoint === "string" &&
    /^https:\/\//.test(sub.endpoint) &&
    sub.keys &&
    typeof sub.keys.p256dh === "string" &&
    typeof sub.keys.auth === "string"
  );
}

function clearClientTimers(clientId) {
  const timers = scheduledTimers.get(clientId);
  if (timers) {
    for (const t of timers) clearTimeout(t);
    scheduledTimers.delete(clientId);
  }
}

async function sendWebPush(clientId, payload) {
  const sub = subscriptions.get(clientId);
  if (!sub) return false;
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 180 });
    return true;
  } catch (err) {
    if (err && (err.statusCode === 404 || err.statusCode === 410)) {
      subscriptions.delete(clientId);
      clearClientTimers(clientId);
    }
    return false;
  }
}

app.get("/api/push/vapid-key", (_req, res) => {
  res.json({ enabled: true, publicKey: vapidKeys.publicKey });
});

app.post("/api/push/subscribe", (req, res) => {
  const { clientId, subscription } = req.body || {};
  if (!validClientId(clientId) || !validSubscription(subscription)) {
    return res.status(400).json({ ok: false, error: "Invalid subscription payload" });
  }
  subscriptions.set(clientId, subscription);
  return res.json({ ok: true });
});

app.post("/api/push/schedule", (req, res) => {
  const { clientId, reminders } = req.body || {};
  if (!validClientId(clientId) || !Array.isArray(reminders)) {
    return res.status(400).json({ ok: false, error: "Invalid schedule payload" });
  }
  if (!subscriptions.has(clientId)) {
    return res.status(404).json({ ok: false, error: "Client not subscribed" });
  }

  clearClientTimers(clientId);
  const now = Date.now();
  const maxAheadMs = 4 * 60 * 60 * 1000; // cap at 4 hours ahead
  const timers = [];

  for (const item of reminders.slice(0, 40)) {
    if (!item || typeof item.at !== "number") continue;
    const delay = item.at - now;
    if (delay < -10000 || delay > maxAheadMs) continue;

    const payload = {
      title: String(item.title || "MRT Spotter · Trip Reminder").slice(0, 140),
      body: String(item.body || "Your train is approaching the next station.").slice(0, 280),
      tag: String(item.tag || item.id || "mrt-trip").slice(0, 80),
      kind: String(item.kind || "station").slice(0, 24),
      line: String(item.line || "").slice(0, 12),
      stationCode: String(item.stationCode || "").slice(0, 16),
      stationName: String(item.stationName || "").slice(0, 80),
      tripKey: String(item.tripKey || "").slice(0, 120),
      url: "./"
    };

    const timer = setTimeout(() => {
      sendWebPush(clientId, payload);
    }, Math.max(250, delay));
    timers.push(timer);
  }

  if (timers.length) scheduledTimers.set(clientId, timers);
  return res.json({ ok: true, scheduled: timers.length });
});

app.post("/api/push/cancel", (req, res) => {
  const { clientId } = req.body || {};
  if (!validClientId(clientId)) {
    return res.status(400).json({ ok: false, error: "Invalid clientId" });
  }
  clearClientTimers(clientId);
  return res.json({ ok: true });
});

app.post("/api/push/test", async (req, res) => {
  const { clientId, payload } = req.body || {};
  if (!validClientId(clientId) || !subscriptions.has(clientId)) {
    return res.status(404).json({ ok: false, error: "Not subscribed" });
  }
  const safePayload = {
    title: String((payload && payload.title) || "MRT Spotter · Test Trip Reminder").slice(0, 140),
    body: String((payload && payload.body) || "Train approaching your next station in ~1 min.").slice(0, 280),
    tag: String((payload && payload.tag) || "mrt-trip-test").slice(0, 80),
    kind: String((payload && payload.kind) || "station").slice(0, 24),
    line: String((payload && payload.line) || "").slice(0, 12),
    stationCode: String((payload && payload.stationCode) || "").slice(0, 16),
    stationName: String((payload && payload.stationName) || "").slice(0, 80),
    url: "./"
  };
  const sent = await sendWebPush(clientId, safePayload);
  return res.status(sent ? 200 : 502).json({ ok: sent });
});

/* ---------- Static MRT Spotter website & bundled timetable ---------- */
app.use("/tools", (_req, res) => {
  res.status(404).end();
});

app.get("/data/:name", (req, res, next) => {
  const name = path.basename(req.params.name);
  const allowed = new Set(["timetable.json", "buildings.json", "tracks.json", "exits.json"]);
  if (!allowed.has(name)) {
    return next();
  }

  const webFile = path.join(webDataDir, name);
  if (fs.existsSync(webFile)) {
    return res.sendFile(webFile);
  }

  if (name === "timetable.json") {
    const repoTimetable = path.join(dataDir, "lta-timetable.json");
    if (fs.existsSync(repoTimetable)) {
      return res.sendFile(repoTimetable);
    }
  }

  res.type("application/json").status(200).send("");
});

app.use(express.static(webDir, { index: "index.html" }));

app.listen(PORT, HOST, () => {
  console.log(`MRT Spotter server running at http://${HOST}:${PORT}`);
});

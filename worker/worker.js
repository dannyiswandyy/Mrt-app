/* MRT Tracker website: data relay (Cloudflare Worker).

   The website is public, so it can't hold the LTA DataMall key, and a browser can't read LTA, Google News or
   YouTube directly (they don't allow other sites to). This relay does, for the MRT Tracker website only:

     GET  /health                         what the relay can do: {ok, lta, ai, yt}
     GET  /lta/TrainServiceAlerts         LTA train service alerts           (adds the key)
     GET  /lta/PCDRealTime?TrainLine=NSL  LTA platform crowd levels, one line (adds the key)
     GET  /news?q=…&hl=…&gl=…&ceid=…      Google News RSS search
     GET  /wx/two-hr-forecast …            NEA weather (data.gov.sg), cached so visitors share one request
     GET  /yt?handle=@railcamsg           which RailCam Singapore stream is live, and its latest videos
     POST /ai                             Ask tab: one Claude request (only if ANTHROPIC_API_KEY is set)

   Settings (wrangler.toml [vars] and secrets):
     ALLOWED_ORIGINS   sites that may use it, comma separated, e.g. "https://dannyiswandyy.github.io"
     LTA_KEY           secret: the LTA DataMall AccountKey
     ANTHROPIC_API_KEY secret, optional: lets the Ask tab use Claude (costs money per question)
     AI_MODEL          optional: the Claude model (the app's own by default)

   Anything else, any other site, or any other address is refused. Replies are cached briefly at Cloudflare,
   so many visitors don't mean many requests to LTA. */

const LTA = "https://datamall2.mytransport.sg/ltaodataservice/";
const LTA_LINES = new Set(["CCL", "CEL", "CGL", "DTL", "EWL", "NEL", "NSL", "BPL", "SLRT", "PLRT", "TEL"]);
const YT_HANDLES = new Set(["@railcamsg"]);
const WX = "https://api-open.data.gov.sg/v2/real-time/api/";
const WX_PATHS = new Set(["two-hr-forecast", "rainfall", "air-temperature", "wind-direction", "wind-speed", "weather?api=lightning"]);
const AI_URL = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-haiku-5-5";                 // the same model the Android app uses
const UA = "MRTTracker-Web/1.0 (+relay)";

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const allowed = allowedOrigin(origin, env);
    if (request.method === "OPTIONS") {
      return allowed ? new Response(null, {status: 204, headers: cors(origin, {"Access-Control-Max-Age": "86400"})})
                     : new Response(null, {status: 403});
    }
    // only the website (a browser sends its Origin); anything else is turned away
    if (!allowed) return text(403, "This relay only serves the MRT Tracker website.", "");
    try {
      const res = await route(request, env, ctx);
      return withCors(res, origin);
    } catch (e) {
      return text(502, "The relay couldn't reach the service.", origin);
    }
  }
};

async function route(request, env, ctx) {
  const url = new URL(request.url), path = url.pathname;
  if (request.method === "GET" && path === "/health") {
    return json({ok: true, lta: !!env.LTA_KEY, ai: !!env.ANTHROPIC_API_KEY, yt: true});
  }
  if (request.method === "GET" && path === "/lta/TrainServiceAlerts") {
    if (!env.LTA_KEY) return text(503, "No LTA key is set on the relay.");
    return upstream(LTA + "TrainServiceAlerts", {AccountKey: env.LTA_KEY, accept: "application/json"}, 30);
  }
  if (request.method === "GET" && path === "/lta/PCDRealTime") {
    if (!env.LTA_KEY) return text(503, "No LTA key is set on the relay.");
    const line = url.searchParams.get("TrainLine") || "";
    if (!LTA_LINES.has(line)) return text(400, "Unknown train line.");
    return upstream(LTA + "PCDRealTime?TrainLine=" + line, {AccountKey: env.LTA_KEY, accept: "application/json"}, 120);
  }
  if (request.method === "GET" && path === "/news") {
    const q = new URLSearchParams();
    for (const k of ["q", "hl", "gl", "ceid"]) { const v = url.searchParams.get(k); if (v != null) q.set(k, v.slice(0, 500)); }
    if (!q.get("q")) return text(400, "No search.");
    return upstream("https://news.google.com/rss/search?" + q, {accept: "application/rss+xml, text/xml"}, 600);
  }
  if (request.method === "GET" && path.startsWith("/wx/")) {
    const what = path.slice(4) + url.search;
    if (!WX_PATHS.has(what)) return text(404, "Not found.");
    return upstream(WX + what, {accept: "application/json"}, 120);
  }
  if (request.method === "GET" && path === "/yt") {
    const handle = url.searchParams.get("handle") || "";
    if (!YT_HANDLES.has(handle)) return text(400, "Unknown channel.");
    return json(await liveLookup(handle), 200, 120);
  }
  if (request.method === "POST" && path === "/ai") {
    if (!env.ANTHROPIC_API_KEY) return text(503, "The Ask tab's Claude isn't set up on the relay.");
    if (tooMany(request.headers.get("CF-Connecting-IP") || "?", Number(env.AI_PER_HOUR) || 30)) return text(429, "Too many questions for now. Try again later.");
    return askAi(request, env);
  }
  return text(404, "Not found.");
}

/* ---- helpers ---- */
function allowedOrigin(origin, env) {
  if (!origin) return false;
  const list = String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim().replace(/\/+$/, "")).filter(Boolean);
  return list.includes(origin);
}
function cors(origin, extra = {}) {
  return {"Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, accept", "Vary": "Origin", ...extra};
}
function withCors(res, origin) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors(origin))) h.set(k, v);
  // Defense-in-depth headers for every relay response.
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "no-referrer");
  h.set("X-Frame-Options", "DENY");
  h.set("Cross-Origin-Resource-Policy", "same-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  h.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  h.delete("set-cookie");
  return new Response(res.body, {status: res.status, headers: h});
}
function text(status, msg, origin) {
  const h = {"content-type": "text/plain; charset=utf-8"};
  if (origin) Object.assign(h, cors(origin));
  return new Response(msg, {status, headers: h});
}
function json(obj, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(obj), {status, headers: {"content-type": "application/json; charset=utf-8",
    "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store"}});
}
/* Fetches from LTA, Google News or YouTube, cached at Cloudflare for `ttl` seconds (good replies only). */
/* Also kept in this Worker's memory for `ttl`, which works on a plain *.workers.dev address too. */
const memo = new Map();
async function upstream(u, headers, ttl) {
  const now = Date.now(), hit = memo.get(u);
  let status, body, type;
  if (hit && hit.until > now) ({status, body, type} = hit);
  else {
    const r = await fetch(u, {headers: {"User-Agent": UA, ...headers}, cf: {cacheTtlByStatus: {"200-299": ttl, "400-599": 0}, cacheEverything: true}});
    status = r.status; body = await r.text(); type = r.headers.get("content-type") || "text/plain";
    if (status === 200) { if (memo.size > 200) memo.clear(); memo.set(u, {status, body, type, until: now + ttl * 1000}); }
  }
  return new Response(body, {status, headers: {"content-type": type, "cache-control": `public, max-age=${Math.min(ttl, 60)}`}});
}
async function pageText(u, limit) {
  const r = await fetch(u, {headers: {"User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
    "Accept-Language": "en-SG,en;q=0.9", "Cookie": "CONSENT=YES+1"}, cf: {cacheTtl: 120, cacheEverything: true}});
  const t = await r.text();
  return t.length > limit ? t.slice(0, limit) : t;
}
const first = (s, re) => { const m = re.exec(s || ""); return m ? m[1] : null; };
const unescapeHtml = s => (s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/* The same as the Android app's MainActivity.liveLookup: the channel's /live page is the live video's page
   while it's live; when it isn't, the channel's latest videos from its RSS feed. */
async function liveLookup(handle) {
  const page = await pageText("https://www.youtube.com/" + handle + "/live", 6000000);
  const video = first(page, /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})"/);
  const channel = first(page, /"(?:externalId|channelId)":"(UC[A-Za-z0-9_-]{22})"/);
  const live = !!video && (page.includes('"isLiveNow":true') || page.includes('"isLive":true'));
  const out = {video: video || "", live, upcoming: !!video && !live && page.includes('"isUpcoming":true'),
    title: unescapeHtml(first(page, /<meta name="title" content="([^"]*)"/)), start: first(page, /"startTimestamp":"([^"]+)"/) || "", channel: channel || ""};
  if (!live && channel) {
    const rss = await pageText("https://www.youtube.com/feeds/videos.xml?channel_id=" + channel, 1000000);
    out.latest = [];
    for (const m of rss.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      if (out.latest.length >= 6) break;
      const v = first(m[1], /<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/); if (!v) continue;
      out.latest.push({video: v, title: unescapeHtml(first(m[1], /<title>([^<]*)<\/title>/)), published: first(m[1], /<published>([^<]+)<\/published>/) || ""});
    }
  }
  return out;
}

/* A rough limit on Ask questions per visitor per hour (per Cloudflare server, so it's a brake, not a wall). */
const asked = new Map();
function tooMany(ip, perHour) {
  const now = Date.now(), list = (asked.get(ip) || []).filter(t => now - t < 3600e3);
  if (list.length >= perHour) { asked.set(ip, list); return true; }
  list.push(now); asked.set(ip, list);
  if (asked.size > 5000) asked.clear();
  return false;
}

/* The same rules as the Android app's askAi: its own model, answers capped, no streaming, size limited. */
async function askAi(request, env) {
  const body = await request.text();
  if (body.length > 200000) return text(413, "Request too large.");
  let req; try { req = JSON.parse(body); } catch (e) { return text(400, "Bad request."); }
  if (!req || typeof req !== "object" || !Array.isArray(req.messages)) return text(400, "Bad request.");
  req.model = env.AI_MODEL || AI_MODEL;
  req.max_tokens = Math.max(1, Math.min(Number(req.max_tokens) || 800, 1024));
  delete req.stream;
  const r = await fetch(AI_URL, {method: "POST", headers: {"content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01"},
    body: JSON.stringify(req)});
  return new Response(await r.text(), {status: r.status, headers: {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"}});
}

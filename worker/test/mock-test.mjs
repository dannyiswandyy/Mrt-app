// Tests the relay's logic with a fake network (no Cloudflare account or wrangler needed):  node test/mock-test.mjs
import assert from "node:assert/strict";
import worker from "../worker.js";

const ORIGIN = "https://dannyiswandyy.github.io";
const env = {ALLOWED_ORIGINS: ORIGIN + ", http://localhost:8080", LTA_KEY: "TEST-LTA-KEY", ANTHROPIC_API_KEY: "TEST-AI-KEY", AI_PER_HOUR: "3"};
const calls = [];
globalThis.fetch = async (u, opt = {}) => {
  const url = String(u), h = new Headers(opt.headers || {});
  calls.push({url, headers: h, body: opt.body, method: opt.method || "GET"});
  if (url.startsWith("https://datamall2.mytransport.sg/")) return new Response(JSON.stringify({value: {Status: 1, AffectedSegments: [], Message: []}, key: h.get("AccountKey")}), {status: 200, headers: {"content-type": "application/json"}});
  if (url.startsWith("https://api-open.data.gov.sg/")) return new Response('{"code":0,"data":{}}', {status: 200});
  if (url.startsWith("https://news.google.com/")) return new Response("<rss><channel><item><title>MRT news</title></item></channel></rss>", {status: 200, headers: {"content-type": "application/rss+xml"}});
  if (url === "https://www.youtube.com/@railcamsg/live") return new Response('<link rel="canonical" href="https://www.youtube.com/watch?v=SxzLPHGBkIc"><meta name="title" content="RailCam &amp; live">"channelId":"UCE4GB42V5snV_ptZ_hP4c3A" "isLiveNow":true');
  if (url.startsWith("https://api.anthropic.com/")) return new Response(JSON.stringify({content: [{type: "text", text: "hi"}]}), {status: 200});
  return new Response("nope", {status: 404});
};
const req = (path, init = {}, origin = ORIGIN) => {
  const headers = new Headers(init.headers || {}); if (origin) headers.set("Origin", origin);
  return worker.fetch(new Request("https://mrt-relay.example.workers.dev" + path, {...init, headers}), env, {waitUntil(){}});
};
let n = 0; const ok = (name) => { n++; console.log("✓", name); };

let r = await req("/health", {}, null); assert.equal(r.status, 403); ok("no Origin → 403");
r = await req("/health", {}, "https://evil.example"); assert.equal(r.status, 403); assert.equal(r.headers.get("Access-Control-Allow-Origin"), null); ok("other site → 403, no CORS");
r = await req("/health", {method: "OPTIONS"}); assert.equal(r.status, 204); assert.equal(r.headers.get("Access-Control-Allow-Origin"), ORIGIN); ok("preflight from the site → 204 + CORS");
r = await req("/health"); assert.deepEqual(await r.json(), {ok: true, lta: true, ai: true, yt: true}); assert.equal(r.headers.get("Access-Control-Allow-Origin"), ORIGIN); ok("/health");
r = await req("/health", {}, "http://localhost:8080"); assert.equal(r.status, 200); ok("second allowed origin");
r = await worker.fetch(new Request("https://x/health", {headers: {Origin: ORIGIN}}), {ALLOWED_ORIGINS: ORIGIN}, {}); assert.deepEqual(await r.json(), {ok: true, lta: false, ai: false, yt: true}); ok("/health without secrets");

calls.length = 0;
r = await req("/lta/TrainServiceAlerts"); assert.equal(r.status, 200);
assert.equal(calls[0].url, "https://datamall2.mytransport.sg/ltaodataservice/TrainServiceAlerts"); assert.equal(calls[0].headers.get("AccountKey"), "TEST-LTA-KEY");
assert.equal(r.headers.get("Access-Control-Allow-Origin"), ORIGIN); ok("alerts: key added upstream, CORS on reply");
r = await req("/lta/TrainServiceAlerts"); assert.equal(r.status, 200); assert.equal(calls.length, 1); ok("alerts: a second visitor within 30 s is answered from memory");
r = await req("/lta/PCDRealTime?TrainLine=NSL"); assert.equal(r.status, 200); assert.ok(calls[1].url.endsWith("PCDRealTime?TrainLine=NSL")); ok("crowd for a line");
r = await req("/lta/PCDRealTime?TrainLine=NSL%26x=1"); assert.equal(r.status, 400); ok("crowd: unknown line refused");
r = await req("/lta/BusArrivalv2?BusStopCode=1"); assert.equal(r.status, 404); ok("other LTA datasets refused");
r = await worker.fetch(new Request("https://x/lta/TrainServiceAlerts", {headers: {Origin: ORIGIN}}), {ALLOWED_ORIGINS: ORIGIN}, {}); assert.equal(r.status, 503); ok("alerts without LTA_KEY → 503");

calls.length = 0;
r = await req("/wx/weather?api=lightning"); assert.equal(r.status, 200); assert.equal(calls[0].url, "https://api-open.data.gov.sg/v2/real-time/api/weather?api=lightning"); ok("weather passed on");
r = await req("/wx/../../secret"); assert.equal(r.status, 404); r = await req("/wx/psi"); assert.equal(r.status, 404); ok("other weather paths refused");

calls.length = 0;
r = await req("/news?q=MRT%20Singapore&hl=en-SG&gl=SG&ceid=SG:en&evil=1"); assert.equal(r.status, 200);
assert.equal(calls[0].url, "https://news.google.com/rss/search?q=MRT+Singapore&hl=en-SG&gl=SG&ceid=SG%3Aen"); assert.ok((await r.text()).includes("MRT news")); ok("news: only q/hl/gl/ceid passed on");
r = await req("/news"); assert.equal(r.status, 400); ok("news without a search → 400");

r = await req("/yt?handle=@railcamsg"); const y = await r.json();
assert.equal(y.video, "SxzLPHGBkIc"); assert.equal(y.live, true); assert.equal(y.channel, "UCE4GB42V5snV_ptZ_hP4c3A"); assert.equal(y.title, "RailCam & live"); ok("yt live lookup parsed like the app");
r = await req("/yt?handle=@someoneelse"); assert.equal(r.status, 400); ok("yt: other channels refused");

calls.length = 0;
r = await req("/ai", {method: "POST", body: JSON.stringify({model: "expensive", max_tokens: 99999, stream: true, messages: [{role: "user", content: "hi"}]})});
assert.equal(r.status, 200); const sent = JSON.parse(calls[0].body);
assert.equal(sent.model, "claude-haiku-5-5"); assert.equal(sent.max_tokens, 1024); assert.equal(sent.stream, undefined); assert.equal(calls[0].headers.get("x-api-key"), "TEST-AI-KEY"); ok("ai: model fixed, answer capped, no streaming, key added");
r = await req("/ai", {method: "POST", body: "not json"}); assert.equal(r.status, 400); ok("ai: bad request refused");
r = await req("/ai", {method: "POST", body: JSON.stringify({messages: []})}); r = await req("/ai", {method: "POST", body: JSON.stringify({messages: []})}); assert.equal(r.status, 429); ok("ai: per-visitor limit");
r = await worker.fetch(new Request("https://x/ai", {method: "POST", headers: {Origin: ORIGIN}, body: "{}"}), {ALLOWED_ORIGINS: ORIGIN}, {}); assert.equal(r.status, 503); ok("ai off without ANTHROPIC_API_KEY");
r = await req("/anything"); assert.equal(r.status, 404); ok("unknown path → 404");

globalThis.fetch = async () => { throw new Error("down"); };
r = await req("/lta/PCDRealTime?TrainLine=TEL"); assert.equal(r.status, 502); assert.equal(r.headers.get("Access-Control-Allow-Origin"), ORIGIN); ok("upstream down → 502 with CORS");
console.log(`\n${n} checks passed`);

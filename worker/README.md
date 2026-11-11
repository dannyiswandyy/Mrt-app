# MRT Tracker website: data relay (Cloudflare Worker)

The website (GitHub Pages) is public, so it can't hold the LTA DataMall key, and a browser isn't allowed to read
LTA, Google News or YouTube directly. This small Worker does it for the website only. It holds the key as a
Cloudflare **secret** and passes on just these:

| Website asks for | Relay path | Upstream | Needs |
|---|---|---|---|
| LTA train service alerts | `/lta/TrainServiceAlerts` | datamall2.mytransport.sg | `LTA_KEY` |
| LTA platform crowds (per line) | `/lta/PCDRealTime?TrainLine=NSL` | datamall2.mytransport.sg | `LTA_KEY` |
| Rail news | `/news?q=…` | news.google.com RSS | – |
| Live cam: which stream is live | `/yt?handle=@railcamsg` | youtube.com | – |
| NEA weather (shared, cached) | `/wx/two-hr-forecast` … | api-open.data.gov.sg | – |
| Ask tab (Claude) | `POST /ai` | api.anthropic.com | `ANTHROPIC_API_KEY` (optional) |

Only the origins in `ALLOWED_ORIGINS` get answers (with CORS); other sites, other addresses and other LTA datasets are refused.
Good replies are kept for 30 s (alerts) to 10 min (news), so many visitors don't mean many requests to LTA.

## Set it up (about 10 minutes, free)

### 1. Cloudflare account
Sign up at <https://dash.cloudflare.com/sign-up> (the free plan is enough: 100,000 requests a day).

### 2. Create the Worker (in the browser, no tools needed)
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Create Worker**.
2. Name it `mrt-relay` → **Deploy** (it deploys a "Hello World" first).
3. **Edit code** → delete everything → paste the whole of `worker/worker.js` → **Deploy**.
4. Note its address, e.g. `https://mrt-relay.YOUR-NAME.workers.dev`.

### 3. Settings and secrets
Worker → **Settings** → **Variables and Secrets** → **Add**:

| Type | Name | Value |
|---|---|---|
| Text | `ALLOWED_ORIGINS` | `https://dannyiswandyy.github.io` |
| Secret | `LTA_KEY` | your LTA DataMall AccountKey |
| Secret (optional) | `ANTHROPIC_API_KEY` | a Claude API key, only if the Ask tab should use Claude |

Click **Deploy** after adding them. (`ALLOWED_ORIGINS` is the site's origin only: no `/Mrt-app/` path, no `/` at the end.)

**About the LTA key:** the Android app's key sits in `app/build.gradle` only lightly scrambled, in a public repository,
so treat it as already exposed. Best: request a fresh key at <https://datamall.lta.gov.sg> ("Request for API Access")
and put that one only in the Worker secret.

**About the Claude key:** anyone who finds the relay can send it questions (the Worker fixes the model, caps each
answer at 1,024 tokens and allows about 30 questions an hour per visitor, but it's still your bill). Leave it out
and the Ask tab uses its built-in answers.

### 4. Check it
```
curl -H "Origin: https://dannyiswandyy.github.io" https://mrt-relay.YOUR-NAME.workers.dev/health
```
should print `{"ok":true,"lta":true,"ai":false,"yt":true}`. (Opening `/health` in a browser tab shows
"This relay only serves the MRT Tracker website." That's expected: a tab sends no Origin.)

### 5. Point the website at it
Edit `web/config.js`:
```js
window.MRT_WEB_CONFIG = {
  proxy: "https://mrt-relay.YOUR-NAME.workers.dev"
};
```
Commit to `main`. The "Deploy MRT Tracker website" workflow publishes it in a minute or two.

## With the command line instead (optional)
```
cd worker
npx wrangler login
npx wrangler deploy                    # uses wrangler.toml (ALLOWED_ORIGINS is set there)
npx wrangler secret put LTA_KEY
npx wrangler secret put ANTHROPIC_API_KEY   # optional
```

## Test without Cloudflare
`node worker/test/mock-test.mjs` runs the relay's rules against a fake network (Node 18+).

## Notes
* A custom domain for the relay: also add it to `connect-src` in the site's security policy (`web/tools/make_web.py`, `CSP`), then rebuild `web/index.html`.
* Cloudflare free plan: 100,000 requests a day. One open tab uses roughly 300 relay requests an hour (alerts and news every minute while open, crowds every 5 minutes, weather every 10).

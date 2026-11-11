# MRT Tracker website

The normal MRT Tracker app (from `.github/workflows/build-android.yml`, not MRT Dev) as a website on GitHub Pages.

* `index.html`, `livecam.html` – made by `tools/make_web.py` from the app page packed in `build-android.yml`.
  Re-run after the app changes: `python3 web/tools/make_web.py .github/workflows/build-android.yml web`
* `config.js` – the one setting: the data relay's address (see `../worker/README.md`). Empty = no live data.
* `manifest.webmanifest`, `icons/`, `sw.js` – install to home screen and open offline.
* `tools/` – not published. `bridge.js` is the browser stand-in for the Android app's bridge (window.MrtApp).
* `data/` – made by the deploy workflow (`timetable.json` from LTA's GTFS timetable, `buildings.json` from
  OpenStreetMap), with the same tools the app build uses. Not in the repository.

## Publish
1. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions** (once).
2. Push a change under `web/` to `main`, or **Actions → Deploy MRT Tracker website → Run workflow**.
3. The site is at <https://dannyiswandyy.github.io/Mrt-app/>.

## What works where
| | No relay (`proxy: ""`) | With the relay |
|---|---|---|
| Map, trains, Line Board, next trains, first/last trains, routes, history, train info | ✓ (LTA timetable if the deploy got it, else estimates) | ✓ |
| Buildings on the map ("3D" button) | ✓ if the deploy got them | ✓ |
| Weather on the map | ✓ straight from data.gov.sg | ✓ via the relay (cached) |
| Live cam | ✓ YouTube's channel-live player | ✓ the app's player: finds new streams, lists latest videos |
| LTA disruption alerts, platform crowds | "Live data unavailable" | ✓ |
| Rail news | "unavailable on this website" | ✓ |
| Ask tab | built-in answers | built-in, or Claude if `ANTHROPIC_API_KEY` is set on the relay |
| In-app updates, LTA timetable download, train spotting | hidden (phone app only) | hidden |

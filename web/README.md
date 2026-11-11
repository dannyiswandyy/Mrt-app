# MRT Tracker website

The normal MRT Tracker app (from `.github/workflows/build-android.yml`, not MRT Dev) as a website on GitHub Pages.

* `index.html`, `livecam.html` – made by `tools/make_web.py` from the app page packed in `build-android.yml`.
  Re-run after the app changes: `python3 web/tools/make_web.py .github/workflows/build-android.yml web`
* `config.js` – the one setting: the data relay's address (see `../worker/README.md`). Empty = no live data.
  The live site uses `https://mrt-relay.dannyiswandyy.workers.dev`.
* `manifest.webmanifest`, `icons/`, `sw.js` – install to home screen and open offline.
* `tools/` – not published. `bridge.js` is the browser stand-in for the Android app's bridge (window.MrtApp).
* `data/` – made by the deploy workflow (`timetable.json` from LTA's GTFS timetable, `buildings.json` and
  `tracks.json` from OpenStreetMap), with the same tools the app build uses. Not in the repository.
  Without `tracks.json`, the RTS Link and Sentosa Express stay straight on the map.

The website follows the public app: interchange code pills, the 3D map, trip planner, spotted-train tags,
sighting position anchors, and the same on-page performance work. Features that need the phone
(home-screen widget, Android notifications and trip alarms, in-app updates) stay hidden. Sharing the
spotter's log uses the browser share sheet when there is one, or copies the text.

## Publish
1. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions** (once).
2. Push a change under `web/` to `main`, or **Actions → Deploy MRT Tracker website → Run workflow**.
3. The site is at <https://dannyiswandyy.github.io/Mrt-app/>.

## What works where
| | No relay (`proxy: ""`) | With the relay |
|---|---|---|
| Map, trains, Line Board, next trains, first/last trains, routes, history, train info, code pills, trip planner, spotted-train tags | ✓ (LTA timetable if the deploy got it, else estimates) | ✓ |
| Buildings on the map and the 3D map button | ✓ if the deploy got them | ✓ |
| RTS Link and Sentosa Express track shapes | ✓ if the deploy got `tracks.json`, else those lines stay straight | ✓ |
| Weather on the map | ✓ straight from data.gov.sg | ✓ via the relay (cached) |
| Live cam (stream, Sound off, Check for live, Open in YouTube, credit) | ✓ YouTube's channel-live player | ✓ the app's player: finds new streams, lists latest videos |
| LTA disruption alerts, platform crowds | "Live data unavailable" | ✓ |
| Rail news | "unavailable on this website" | ✓ |
| Ask tab | built-in answers | built-in, or Claude if `ANTHROPIC_API_KEY` is set on the relay |
| In-app updates, LTA timetable download, home-screen widget, Android notifications and trip alarms | hidden (phone app only) | hidden |
| DEV badge / test mode, Drive a train, Live cam train-spotting panel, Google Maps timing match | not on this site (MRT Dev only) | not on this site |

Deployed via GitHub Pages: https://dannyiswandyy.github.io/Mrt-app/

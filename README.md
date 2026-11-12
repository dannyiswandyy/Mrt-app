# Singapore MRT Tracker

A Singapore MRT/LRT tracker for Android, plus a website at [dannyiswandyy.github.io/Mrt-app](https://dannyiswandyy.github.io/Mrt-app/). It shows the network map (2D and 3D), trains and timings, station and train-model information, weather, news, disruptions, and a trip planner.

**MRT Tracker** (the public / beta app you use day to day) is built from `.github/workflows/build-android.yml`. Each build publishes `mrt-tracker.apk` under Releases. 3D buildings are downloaded in smaller parts with retries and cached between builds, so when OpenStreetMap is slow the missing station areas fill in over the next few builds. If the LTA timetable can't be downloaded, the build summary says whether the key was refused or the file link failed, and the app falls back to estimates.

A separate private dev build exists for the maintainer's own testing.

## Current features (MRT Tracker)

- Singapore MRT/LRT network map, with interchange **code pills** and a 3D map you can move, turn and tilt
- Train positions and arrival times from LTA's packed timetable, with a fallback to estimates built from the operators' train duty rosters (weekday, Saturday, Sunday and public holiday)
- When you **log a sighting** from a train's sheet, a small tag (model, Spotted or Rode) stays on that train's arrow on the 2D and 3D maps for the rest of that service day, and the train is **moved to the station and time you logged** so the map, Line Board and next-train times follow
- Station search, station sheets, favourites, and train-model information and photos (with source attribution)
- Trip planner: the fastest way by train, with the next departures, changes, duration, arrival time, fare, and the route drawn on the map
- Live weather (NEA via data.gov.sg), disruptions, crowds and news
- Live cam tab (RailCam Singapore on YouTube): the stream, Sound off, Check for live, Open in YouTube, and credit
- Home-screen widget for the next trains at your first saved station
- Trip reminders from a planned trip, and disruption alerts for your saved lines (including while the app is closed)
- Offline mode: saved map tiles and fonts still show when the connection drops
- Ask tab (built-in answers, or Claude if an `ANTHROPIC_API_KEY` secret is set)
- Share the spotter's log, in-app update checking, and API timeout/failure handling with cached-data fallback
- 3D buildings near stations (OpenStreetMap, packed at build time) and real track shapes for the **RTS Link** and **Sentosa Express** (also from OpenStreetMap at build time)
- Tuned for typical phones: the map caches static layers and skips extra redraws, timers pause when the tab is in the background, 3D and the Live cam start only when you open them, search is debounced, and a few caches are capped. The arrows, shadows and direction of travel are unchanged.
- App icon: Danny's train-front design (white train with a red and green stripe, yellow headlights and rails) on a dark rounded square, drawn as vector shapes that fit inside Android's adaptive-icon safe zone

## Train counts and timetable estimates

When LTA's timetable isn't available for a line, the app estimates trains from how many are out at each time of day. These counts come from the operators' **train duty rosters**. Each run is counted by its duty: FD = full day (morning to 8pm), HD = half day (to 2pm), (AM) = 7–9.30am peak, (PM) = 5–8pm peak, (OP) = between the peaks, and LN = late night. Depot transfers aren't counted.

| Line | Weekday | Saturday | Sunday | Public holiday |
| --- | --- | --- | --- | --- |
| North-South | 12 Nov 2026 | 31 Oct 2026 | 1 Nov 2026 | 9 Nov 2026 |
| East-West | 12 Nov 2026 | 31 Oct 2026 | 1 Nov 2026 | 9 Nov 2026 |
| Changi Airport branch | same every day: 2 trains, 3 in the 5–8pm peak | | | |
| North East | 12 Nov 2026 | 31 Oct 2026 | 1 Nov 2026 | 9 Nov 2026 (also extended-service nights, 7 Nov 2026) |
| Thomson-East Coast | 12 Nov 2026 | 31 Oct 2026 | 1 Nov 2026 | 9 Nov 2026 (extended-service nights: 7 Nov 2026) |
| Circle | 12 Nov 2026 (both loops and the Dhoby Ghaut service, counted along the whole line) | 31 Oct 2026 loops (short shuttles not counted) | 1 Nov 2026 loops | 9 Nov 2026 loops; extended-service nights: 7 Nov 2026 loops |

- **Train run number roster sheet:** the [NSEWL roster sheet](https://docs.google.com/spreadsheets/d/1O65RS9SMggfmGiQh7gCNQU-1l7l1sV0q85euH3gIAwQ/edit) gives the same weekday totals. It also supplies the short trips:
  - About one in 7 North-South Line trains in the weekday morning peak turn back at Yishun.
  - Outside the peaks, every other East-West Line train towards Tuas Link ends at Joo Koon.
- **Downtown Line:** uses its usual gaps, because its rosters are incomplete. The run lists so far (weekdays 3 Nov 2026, weekends 1 Nov 2026, public holidays 9 Nov 2026) are kept as notes in the app page.
- **Thomson-East Coast Sundays and public holidays:** those rosters have no late-night marks. Full-day trains run until the last trains, and PM trains stop around 8pm.
- **Updating counts:** the counts and short trips live in `NSL_TRAINS`, `EWL_TRAINS`, `CG_TRAINS`, `NEL_TRAINS`, `TEL_TRAINS`, `CCL_TRAINS` and `SHORT_PEAK` in the app page.
- **Extended-service nights:** these are in `EXT_DAYS` and `EXT_LAST`. Add the date and each line's later last trains.

## Website

The website is a full web version of the **normal** (public) app, not MRT Dev, at:

**[https://dannyiswandyy.github.io/Mrt-app/](https://dannyiswandyy.github.io/Mrt-app/)**

It is published by GitHub Pages (the `web/` folder, workflow `.github/workflows/deploy-web.yml`). Anyone can open it; no GitHub account is needed. The deploy also packs LTA's timetable, 3D buildings and RTS Link / Sentosa Express tracks the same way the Android app build does. Without the tracks file, those two lines stay straight on the map.

Live disruptions, crowds, news and LTA data go through an optional **Cloudflare Worker** relay so the LTA key is not exposed in the browser:

1. Create a Worker named `mrt-relay` and deploy the code from `worker/worker.js`.
2. Under **Settings → Variables and Secrets**, add:
   - `ALLOWED_ORIGINS` (Text): `https://dannyiswandyy.github.io` (no trailing slash, and no `/Mrt-app`)
   - `LTA_KEY` (Secret): your LTA DataMall API key. Prefer a key that is not committed in this repository.
   - `ANTHROPIC_API_KEY` (Secret, optional): only if you want the Ask tab on the website to use Claude. You pay for questions people ask.
3. Point `web/config.js` at the Worker address, for example `https://mrt-relay.yourname.workers.dev`.

Without the relay, the site still works on timetable estimates and shows a "Live data unavailable" banner.

## GitHub Actions secrets (Android builds)

Set these under **Settings → Secrets and variables → Actions**. Do not commit the values.

| Secret | Used by | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Both Android apps (optional) | Lets the Ask tab use Claude. Without it, the Ask tab gives built-in answers. |
| `RELEASES_TOKEN` | MRT Tracker only | Publishes the public update feed to the `mrt-tracker-releases` repo. |

The LTA DataMall key used by the website belongs in the Cloudflare Worker secret `LTA_KEY`, not in this repository.

## Train model information

The train model section can include model-specific photographs and information for Singapore rolling stock such as:

- C151
- C151A
- C151B
- C151C
- C751B
- R151
- Other supported MRT/LRT rolling stock as the database expands

Train photographs are used for informational purposes and are attributed to their respective source websites. External images should not be downloaded, redistributed, or used commercially unless the relevant licence/permission allows it.

## Credits & data sources

This project may use information and imagery from Singapore transport and mapping sources, including:

- Land Transport Authority (LTA) — DataMall timetable, alerts and related APIs
- National Environment Agency (NEA) via data.gov.sg — live weather
- OpenStreetMap contributors — 3D building outlines and RTS Link / Sentosa Express tracks
- SMRT (including train duty rosters)
- SBS Transit (including train duty rosters)
- SGTrains
- Land Transport Guru
- RailCam Singapore (@railcamsg) — the Live cam stream
- Google Maps Platform (MRT Dev timing match only, when configured)

All third-party trademarks, photographs, logos, and copyrighted material remain the property of their respective owners.

## Disclaimer

This is a fan project and should not be treated as an official LTA, SMRT, SBS Transit, or Google application.

Train locations, arrival information, route information, service status, and other live data may be delayed, incomplete, unavailable, or inaccurate.

Always verify important travel information with official transport sources.

## License

Unless otherwise stated, the original source code in this repository is provided under the license specified by the repository owner.

Third-party data, photographs, APIs, trademarks, and other external content are **not automatically covered by the project's source-code licence** and remain subject to their respective terms and licences.

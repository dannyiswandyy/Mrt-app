# Singapore MRT Tracker

A Singapore MRT/LRT tracker for Android, plus a website at [dannyiswandyy.github.io/Mrt-app](https://dannyiswandyy.github.io/Mrt-app/). It shows the network map (2D and 3D), trains and timings, station and train-model information, weather, news, disruptions, and a trip planner.

There are two Android apps, built from two workflow files in this repository. They can be installed side by side and keep their own settings:

- **MRT Tracker** (the public / beta app you use day to day) is built from `.github/workflows/build-android.yml`. Each build publishes `mrt-tracker.apk` under Releases.
- **MRT Dev** (a separate app for trying new features first) is built from `.github/workflows/build-android-dev.yml`. It has an orange icon and a DEV badge. Each build publishes `mrt-dev.apk` as a pre-release.

## Current features (MRT Tracker)

- Singapore MRT/LRT network map, with interchange **code pills** and a 3D map you can move, turn and tilt
- Train positions and arrival times from LTA's packed timetable, with a fallback to estimates
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

## Dev-only features (MRT Dev)

These stay in MRT Dev until they are ready for the public app:

- The **DEV** badge and **test mode** (sandbox): a pretend clock and fake crowds, disruptions and weather, for trying features at any time. They are never saved.
- **Drive a train**: a driving game on the app's routes, with optional packed OpenBVE train sounds. Still in testing.
- The Live cam **Train spotting [Test]** panel: watches the RailCam video for North-South Line trains and can correct NSL times. The public app's Live cam tab keeps the stream, Sound off, Check for live, Open in YouTube and the credit, but not this panel.
- **Google Maps timing match**: compares the next LTA timetable departure with Google Maps transit routing (Routes API). It is only built into MRT Dev, and only when the `GOOGLE_MAPS_API_KEY` GitHub Actions secret is set.

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
| `GOOGLE_MAPS_API_KEY` | **MRT Dev only** | Google Routes API key for the timing-match button. Restrict the key to the Routes API. It is not packed into the public app. |

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
- SMRT
- SBS Transit
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

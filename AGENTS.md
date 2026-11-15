# Rules for AI helpers working on MRT Tracker

This is the **public** MRT Tracker app and website. Danny works on it with more than one AI (Claude, ChatGPT, Grok). Read this before changing anything, so you don't undo each other's work. New features are tried in MRT Dev (the `mrt-dev-app` repo) first and only come here when Danny asks.

## Before you change anything

1. **Get the newest commit first.** Another AI may have pushed a minute ago. Pull or fetch `main` and build on top of it.
2. **Never force-push** and never reset `main`. If your push is rejected, fetch, put your change on top of the new commits, and push again.
3. **Check that no "Build MRT Tracker app" run is in progress.** Each build replaces the **latest** release, so overlapping builds can leave an older build as the release.

## Where things live

| What | Where |
| --- | --- |
| The app page (map, trains, Live cam, disruptions…) | `web/index.html`, copied into the Android assets by `.github/workflows/build-android.yml` |
| Android project (Java, manifest, Gradle) | written by `.github/workflows/build-android.yml` |
| Build tools (LTA timetable, buildings, RTS/Sentosa tracks, station exits) and the station list they use | `tools/` (`build_*.py`, `lines.json`), copied into the project by `build-android.yml` and used by `deploy-web.yml` too |
| The website | `web/index.html` (the same page, made for browsers), published by `deploy-web.yml` |
| Data relay for the website | `worker/` (Cloudflare Worker; the LTA key is a Cloudflare secret, not in this repo) |
| Tests | `tests/timetable-check.js`, run by `timetable-check.yml` |
| App signing key | `signing/mrt-tracker.jks` (made by the first build; keep it, or updates won't install over the old app) |

## Changing the app page

- **Change the app and the website together.** `web/index.html` is the canonical public page. The Android build copies it into the app assets, while the Pages workflow publishes `web/`. Do not create a second packed copy of the page.
- Edit the page itself. Don't add steps to the workflow that patch `index.html` during the build.
- Trains keep left: each arrow sits on the left of its line in the direction of travel. Don't "fix" arrows by flipping which way trains point.

## Before you push

1. Check the page's script has no syntax errors, for both the app page and `web/index.html`, for example by pulling out the `<script>` blocks and running `node --check`.
2. Run `node tests/timetable-check.js`.
3. Check `build-android.yml` is still valid YAML and under 480 KB. GitHub refuses workflow files of 500 KB or more.

## After you push

- A push that changes `build-android.yml` builds the app. A push that changes `web/` redeploys the website.
- Wait for the runs to finish and check that the **latest** release shows the new version (`MRT Tracker YYYY.MM.DD-HHMM`) before telling Danny it's ready.

## Keep out of this repo

- No keys or tokens in files. Use GitHub Actions secrets (and Cloudflare secrets for the relay).
- Nothing about MRT Dev's test features goes in this repo, the README or the public releases.
- No way for users to download LTA's raw data with the app's key (like the old "Download LTA timetable" button): Danny removed it because it can be misused. The app packs LTA's timetable at build time instead.

## Commit messages

Say what changed for Danny, in plain words. Say which AI you are in the commit or its trailer, so it's clear who did what.

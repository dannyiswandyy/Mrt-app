# Rules for AI helpers working on MRT Tracker

This is the **public** MRT Tracker app and website. Danny works on it with more than one AI (Claude, ChatGPT, Grok). Read this before changing anything, so you don't undo each other's work. New features are tried in MRT Dev (the `mrt-dev-app` repo) first and only come here when Danny asks.

## Shared core and channel controls

The user wants **public Android + public website + private Dev Android** to share approved underlying intelligence and bug fixes. Core capability should not silently fall behind on production just because Dev receives a change. Experimental features can exist in the shared logic but must remain hidden and disabled on public surfaces until expressly approved.

- **Production source of truth:** `web/index.html` and its local `web/*.js` dependencies are used by both the public website and the public Android workflow. When adding a local script reference to `web/index.html`, also copy that file to `mrt-tracker-app/app/src/main/assets/` in `.github/workflows/build-android.yml`. The regression test in `tests/timetable-intelligence.test.mjs` checks this.
- **Explicit visibility flags:** production uses `window.MRT_PRODUCTION=true;window.MRT_DEV_FEATURES=false;`; experimental UI, network requests, simulation and Dev diagnostics must check these flags before loading or operating. Having experimental code present does not grant permission to display or execute it.
- **Dev-only release stays private:** never upload `mrt-dev.apk` to the public repository or include private Dev credentials in a public artifact. The Dev app builds in `SingaporeTrainsProductions/mrt-dev-app`.
- **Promote safely:** synchronize approved core fixes on both sides, while withholding unapproved experimental behaviours. Check website deployment, public APK, and private Dev APK separately; do not say a build is published until the intended release assets are confirmed.
- **No blind automatic cross-repo merges:** the repositories have separate Android packaging and test suites. Review shared source changes for compatibility before applying them.

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
| Future lines and stations (not open yet) | `web/future-lines.js` (data only; the page adds them to `LINES` / `ORDER` / `MAP` like the RTS Link when `window.MRT_SHOW_FUTURE` is true, set just before the main script; it's **false** here until Danny approves showing them). Tested by `tests/future-lines.test.mjs` |
| Data relay for the website | `worker/` (Cloudflare Worker; the LTA key is a Cloudflare secret, not in this repo) |
| Tests | `tests/timetable-check.js`, run by `timetable-check.yml` |
| What's new (the changelog in the app's Settings, shown once after each update, and on the release page) | `tools/build_changelog.py`, run by `build-android.yml` and `deploy-web.yml`; better wording for changes from before it existed in `tools/changelog-overrides.json`. Each build saves its version on the commit it built, as a git note in `refs/notes/versions`: never delete that ref, or every version since is forgotten. Same script as `android/tools/build_changelog.py` in MRT Dev. Tested by `tests/changelog.test.mjs` |
| App signing key | `signing/mrt-tracker.jks` (made by the first build; keep it, or updates won't install over the old app) |

## Changing the app page

- **Change the app and the website together.** `web/index.html` is the canonical public page. The Android build copies it into the app assets, while the Pages workflow publishes `web/`. Do not create a second packed copy of the page.
- Edit the page itself. Don't add steps to the workflow that patch `index.html` during the build.
- Trains keep left: each arrow sits on the left of its line in the direction of travel. Don't "fix" arrows by flipping which way trains point.

## Before you push

1. Check the page's script has no syntax errors, for both the app page and `web/index.html`, for example by pulling out the `<script>` blocks and running `node --check`.
2. Run `node tests/timetable-check.js`.
3. Check `build-android.yml` is still valid YAML and under 480 KB. GitHub refuses workflow files of 500 KB or more.
4. Run `node tests/syntax-check.mjs` and `node tests/page-starts.mjs` (needs Playwright). The page start check opens `web/index.html` in headless Chrome and fails if the page has a script error, doesn't start, or freezes.

Both the app build and the website deploy run these as a **Safety check** job first, and only publish if it passes, so a broken page never replaces the release or the website. Don't remove that job or the `needs: safety` lines.

## After you push

- A push that changes `build-android.yml` builds the app. A push that changes `web/` redeploys the website.
- Wait for the runs to finish and check that the **latest** release shows the new version (`MRT Tracker YYYY.MM.DD-HHMM`) before telling Danny it's ready.

## Keep out of this repo

- No keys or tokens in files. Use GitHub Actions secrets (and Cloudflare secrets for the relay).
- Nothing about MRT Dev's test features goes in this repo, the README or the public releases.
- No way for users to download LTA's raw data with the app's key (like the old "Download LTA timetable" button): Danny removed it because it can be misused. The app packs LTA's timetable at build time instead.

## Commit messages

Say what changed for Danny, in plain words. Say which AI you are in the commit or its trailer, so it's clear who did what.

**The first line is the app's changelog.** Every update's changes are listed in the app and on the website (Settings → What's new, shown once after each update) and on the release page, made from the first line of each commit that changes `web/`, `tools/` or `build-android.yml`. So write that line for people using the app: "Map: special-bound trains drawn dotted", not "fix sheet regression". The AI's name in brackets, `fix:` and parts about tests, checks or builds are left out by themselves. This is the public app, so the line must not mention MRT Dev or anything still being tried there. If it would, or the change is behind the scenes, add a line to the commit message:

```
Changelog: Trains at unusual hours show on every line
```

to word it for the changelog, or `Changelog: skip` to leave it out.

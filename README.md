# MRT Tracker

An Android app for Singapore's MRT and LRT. It shows every train line on a live map and a line board, with next-train times, disruption alerts, platform crowds, news, line history and a train chatbot.

The whole app lives in a single GitHub Actions workflow file. Saving that file builds the app and publishes the `.apk` under **Releases**, ready to install on a phone.

## The two apps

| | MRT Tracker | MRT Dev |
|---|---|---|
| What it's for | The everyday app | Trying new features first |
| Workflow file | `.github/workflows/build-android.yml` | `.github/workflows/build-android-dev.yml` |
| Release | **latest** | **dev** (pre-release) |
| App file | `mrt-tracker.apk` | `mrt-dev.apk` |

## What the app does

- **Map:** every line laid out by real station locations, with moving trains, satellite photos, and 3D buildings when you zoom in on a station.
- **Line Board:** each line as a strip of stations, with the trains on it and the next trains at every station.
- **Train times:** from LTA's official train timetable, including public holidays. Where that isn't available, times are estimated from the operators' train counts and travel times.
- **Updates:** LTA disruption notices, news from Google News, and links to SMRT, SBS Transit and LTA on social media.
- **Platform crowds:** live from LTA.
- **History:** when each line and station opened, train models, and "on this day".
- **Ask:** a chatbot for questions about stations, lines and trains. Claude answers when it's available; otherwise the app gives built-in answers from its own data.
- **In-app updates:** the app checks for a new version every few hours and installs it when you tap the notice.

Also in **MRT Dev** for now:

- **Live cam:** RailCam Singapore's YouTube live stream. The app finds the current stream by itself and checks again every 3 minutes.
- **Special-bound trains:** late-night and early-morning trains that end or start partway along the line, and weekday peak trips from Yishun.
- **First and last trains:** real first and last train times for each line, plus extended service on the eve of public holidays.
- **Weather:** live NEA weather, with rain, cloud, haze and lightning on the 2D map.
- **Test mode:** tap the DEV badge to set a pretend time and fake crowds, disruptions and weather.

## Putting a new version on your phone

1. Delete old downloads of the workflow file on your phone first, so the new one isn't renamed with "(1)".
2. In this repo, open `.github/workflows` and replace the file. Either open it, tap the pencil and paste the new code, or use **Add file → Upload files**. The name must be exactly `build-android.yml` or `build-android-dev.yml`.
3. Check that the line count matches the version you were given.
4. Open **Actions** and wait for **Build MRT Tracker app** or **Build MRT Dev app** to turn green. This takes a few minutes.
5. Open **Releases** and download the `.apk` on your phone to install it. After the first install, the app tells you about new versions itself.

Each workflow only builds when its own file is saved. You can also start one from **Actions → (workflow) → Run workflow**.

## What happens in a build

1. **Writes the app project** from the workflow file. The app's page is stored compressed (the long block of letters), because GitHub won't run a workflow file over 500 KB.
2. **Signs the app** with the key in `signing/mrt-tracker.jks`. The first build creates this key.
3. **Downloads LTA's train timetable** and keeps the last good copy in `data/lta-timetable.json`, so a build still has it if LTA is unreachable.
4. **Downloads buildings** from OpenStreetMap for the 3D map, and keeps them between builds.
5. **Builds the `.apk`** and publishes it to this repo's Releases.
6. **Publishes it to the public `mrt-tracker-releases` repo**, which is where the app checks for updates.

## Settings

Add these under **Settings → Secrets and variables → Actions**:

| Secret | What it does |
|---|---|
| `RELEASES_TOKEN` | Lets builds publish to `mrt-tracker-releases`, so the app hears about updates. Without it, the build still works but the app isn't notified. |
| `ANTHROPIC_API_KEY` | Optional. Lets Claude answer in the Ask tab. Without it, Ask gives built-in answers. |

The LTA DataMall key is built into the app, so nobody needs to enter one.

## Keep in mind

- **Keep this repository private.** It holds the app's signing key and built-in keys.
- **Don't delete `signing/mrt-tracker.jks`.** Without it, new versions won't install over the app already on your phone.
- **Workflow files must stay under 500 KB.** Otherwise GitHub fails the run straight away, with no steps shown.
- **Times show the schedule, not delays.** Disruptions appear under Updates.

## Sources

- **Disruptions, platform crowds and train timetable:** Land Transport Authority (LTA DataMall).
- **News:** Google News, with each outlet named on its headline.
- **Social media:** SMRT (@SMRT_Singapore on X, SMRTCorpSG on Facebook), SBS Transit (@SBSTransit_Ltd on X, SBSTransit on Facebook) and LTA (@LTAsg on X).
- **First, last and special-bound trains:** SMRT and SBS Transit timetables, as listed by Metro Time Info; Wikipedia.
- **Map:** SG Rail Data by Lim Chee Aun (github.com/cheeaun/sgraildata), based on data.gov.sg and LTA data. Satellite photos: Esri World Imagery. 3D buildings: © OpenStreetMap contributors.
- **Weather:** National Environment Agency (NEA), via data.gov.sg.
- **History and train models:** Wikipedia, SGTrains, Land Transport Guru and LTA news releases.
- **Live cam:** RailCam Singapore (@railcamsg) on YouTube.
- **Ask:** Claude by Anthropic.

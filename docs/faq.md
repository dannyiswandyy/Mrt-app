# Frequently asked questions

[← Documentation](README.md) · [Report an issue](https://github.com/dannyiswandyy/Mrt-app/issues/new/choose)

### Where can I get MRT Spotter?

- **Android:** [Latest public APK](https://github.com/dannyiswandyy/Mrt-app/releases/latest). Open the release, download `mrt-tracker.apk`, and follow Android's installation prompts.
- **Web:** [Launch MRT Spotter](https://dannyiswandyy.github.io/Mrt-app/) in a browser. No GitHub account is needed.

The APK is distributed through GitHub Releases. Review the release information and Android permissions before installing.

### Is it an official LTA, SMRT or SBS Transit app?

No. MRT Spotter is an **independent, fan-made project** and is not affiliated with, approved by or endorsed by any rail operator or government agency.

### Are all train positions actually live?

No. Some map positions and train times are **derived from LTA's timetable or estimated from operating patterns**, not independently confirmed GPS locations. Real-life conditions, temporary speed limits, service interruptions and source-data gaps can cause differences.

### What is a train slot or run number?

A **run/slot** is a scheduled service duty. It can link several trips during a service day. It is **not a trainset or fleet number**: a GTFS slot on its own cannot identify the physical vehicle.

### What do FD, HD, AM, PM, OP and LN mean?

These describe broad train duty patterns:

| Label | Meaning |
|:---|:---|
| FD | Full day |
| HD | Half day |
| AM | Morning peak |
| PM | Afternoon/evening peak |
| OP | Off-peak / midday duty |
| LN | Late-night duty, including workings operating from around 23:00 onward |

Combined labels such as **FD LN**, **PM LN** or **OP LN** can appear because duty periods overlap or a run continues late. They do **not** indicate an instantaneous operating state. In the public app, the exact displayed label is inferred from the timetable/service pattern and can be wrong if data is incomplete.

### Can I track the actual physical trainset?

Logged sightings may offer evidence about which trainset worked a run, but a scheduled slot alone is insufficient to confirm a fleet number. Confidence indicators represent evidence, not a guarantee.

### Why does a departure time differ from what I saw at the station?

The timetable can describe planned rather than measured arrivals. Temporary restrictions, dwelling, regulation, changed short workings, special services and missing data can affect actual running.

Please include the line, station, direction, service date/time and a screenshot in a [rail-data correction report](https://github.com/dannyiswandyy/Mrt-app/issues/new/choose).

### Why are some map tracks, stations or 3D buildings missing?

Some track and building data is downloaded and packaged during builds. If a source is unavailable, an earlier cache or simplified geometry may be shown. Stations under testing or not yet open should not be treated as passenger-accessible solely because a track or train arrow appears on the map.

### What works without internet?

Packaged timetable information and previously saved/cached map resources may remain available. Fresh disruption information, external camera streams, weather, cloud-powered answers and other live feeds require network access and sometimes a configured relay.

### Why are the Android app and website slightly different?

They are intended to share the **public** feature set, but the website cannot use Android-only features like the home-screen widget or APK updater. Some service-data features also depend on the web relay. See [platform differences](../web/README.md).

### How do I report a problem?

Use the [GitHub issue forms](https://github.com/dannyiswandyy/Mrt-app/issues/new/choose): choose Bug, Train run / timetable, Map / station, or Feature request. Never attach API keys, passwords or private information.

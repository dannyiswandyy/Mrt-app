# Data sources, evidence and limitations

[← Documentation](README.md) · [FAQ](faq.md)

MRT Spotter blends **published schedules**, external information feeds and limited **inference / user-entered evidence**. Different parts of the app have different levels of certainty.

| Source or method | Used for | What it does *not* prove |
|:---|:---|:---|
| **LTA DataMall GTFS Schedule (Train)** | Scheduled stop times, trips, destinations, duty/slot linkages and service-day patterns when packaged successfully | Continuous actual GPS train positions, specific physical trainset IDs or every last-minute operating change |
| **Operator duty rosters / fallback patterns** | Estimated service levels and run patterns when more direct timetable evidence is absent | Exact train movements on the day of observation |
| **User-logged sightings** | Your spotting log, custom markers and possible trainset evidence | Independent verification without corroboration |
| **LTA service and crowd information** | Disruption and crowdedness displays when accessible | Guaranteed instantaneous status during provider or network outages |
| **NEA / data.gov.sg** | Weather and map effects | Railway running conditions by itself |
| **OpenStreetMap contributors** | Some 3D building data, mapping features and track shapes for selected lines | Guaranteed survey-grade railway alignment or official station-opening status |
| **External RailCam stream** | YouTube live camera and linked video content | Continuous 24/7 camera availability |

## Timetable source and fallback

The Android and web build pipelines attempt to package an LTA train timetable. A saved timetable may be used if the latest download is unavailable. If a suitable timetable is absent, estimated running patterns may appear.

The presence of a train icon or train duty does **not** mean a direct live positional API confirmed that location. The app should identify missing/unavailable live data and refrain from turning inference into confirmed real-time facts.

## Train run terminology

- **Run / slot:** A scheduled daily duty. Several trips may belong to the same run.
- **Trip ID:** An identifier for a scheduled trip in the source timetable. It is not necessarily a physical vehicle number.
- **Trainset / fleet number:** The identity of the actual train. This normally requires separate and reliable observation data.
- **FD, HD, AM, PM, OP, LN:** Broad labels for operating periods, sometimes combined. Actual start/end boundaries should be derived from current timetable evidence, not treated as rigid proof of a train's location.

## Real-world uncertainty

Special events, temporary speed restrictions, short turns, depot transfers, ad hoc test trains and un-opened extensions are particularly sensitive to the difference between scheduled, observed and inferred behaviour. Always check official LTA or operator notices for passenger service and safety information.

## Privacy and source attribution

Do not upload credentials, private data, copyrighted images without permission, or confidential rosters. Third-party photography, logos, data and fonts retain their owners' rights. Public README and ads must not present experimental controls as released features.

**MRT Spotter is an independent enthusiast project and not an official travel authority.**

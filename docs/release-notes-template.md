# Public release notes template

Use this format for the **public** MRT Spotter Android APK, website updates or a coordinated app+web release. It is a **template**, not a claim that every listed feature is part of the latest build.

Copy the section below when preparing human-readable notes:

---

# 🚆 MRT Spotter — YYYY.MM.DD-HHMM

**Release type:** Android public beta / Website / Both

### ✨ Highlights
A two-sentence summary of what changed and why it matters for MRT enthusiasts or commuters.

### 🚉 Train runs and timetable
- [Describe verified duty, timetable or run improvements, if any.]
- [Describe updated sources and any fallback behaviour, if relevant.]

### 🗺️ Map and experience
- [Describe actual UI, station or geometry fixes.]

### 🐛 Fixes and reliability
- [List resolved user-facing issues with a short explanation.]

### ⚠️ Known limitations
- [State any known map, timing, data relay or unsupported-feature limitations.]
- Train positions may be timetable-derived or estimated; scheduled slots are not physical trainset IDs.

### 📲 Get it
- [Android APK](https://github.com/dannyiswandyy/Mrt-app/releases/latest)
- [Open MRT Spotter Web](https://dannyiswandyy.github.io/Mrt-app/)

**Build / commit:** [insert actual SHA or release tag]

*Independent fan-made project. Not affiliated with LTA or any transport operator.*

---

## Maintainer checklist

1. Verify the exact change list against commits and the **public** app/web build, not dev-only experiments.
2. Check relevant GitHub Actions safety checks and release status before announcing the update.
3. Confirm the public APK download and website links work.
4. Use real screenshots, only with permission and clear capture dates.
5. Avoid calling timetable/roster inference "confirmed live GPS".
6. **Do not** publish private Dev APKs, source secrets, sensitive logs, signing keys or unapproved third-party media.

The repository also includes [`.github/release.yml`](../.github/release.yml), a category configuration for GitHub's **Generate release notes** command. It does not change the Android release workflow by itself.

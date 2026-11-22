# Screenshots & media showcase

[← Documentation](README.md) · [Feature guide](features.md)

## What to show in an authentic MRT Spotter gallery

Visitors should see **the real UI from the released public Android app or website**, not a speculative redraw. Useful screens include:

| Recommended capture | Feature to highlight |
|:---|:---|
| Network Map, 2D / 3D | Line colours, map geometry, directional train arrows and station selection |
| Line Board | Next-train information, run numbers and journey sequences |
| Spotter Planner | Selectable line, station, time window, scheduled slots and destination |
| Train sheet / sightings | Logged Spotted or Rode state and evidence markers |
| Trip planner | Route with interchange, duration and fare where shown |
| Station sheet | Station search, code, platform and nearby services |
| Service information | Clearly timestamped, available alerts and weather |

## Publishing guidelines

1. Capture screenshots from **MRT Spotter public** — not private developer tests or experimental panels.
2. Keep the UI pixels, train numbers, times and station names unchanged inside the screenshot; crop only when needed for layout.
3. Make sure no API key, account identifier, precise personal location, private message or other secret is visible.
4. Add a capture date and platform/version. Don't call an old screenshot the current live state.
5. Promotional backgrounds can be illustrated, but label them clearly as artwork and keep UI details authentic.
6. Follow the original copyright and attribution terms for any train photography.

**Current media status:** The repository includes [the branded hero](assets/mrt-spotter-hero.svg) and [a social-preview design](assets/social-preview.svg). A full in-repository gallery of verified public-app screenshots can be added once those image files are approved for public redistribution. This page deliberately does not invent mock app screens or use the private Dev UI.

## Reuse

If you create new approved screenshots, a good structure is `docs/assets/screenshots/` with names such as `network-map-2026-11.png`. Link these directly from the main README with alt text explaining what the screenshot shows. Use the latest published public build rather than a stale developer capture.

> Existing promotional artwork outside the repository is not automatically published here. Obtain permission to publish each screenshot or asset before committing it.

# Contributing to MRT Spotter

Thanks for helping build a better Singapore rail companion. Contributions may be code, a reproducible bug report, a station/map correction, or an observation with clear evidence.

> **This repository is for the public Android app and website.** Features intended for private development testing must not be added to public navigation, builds, release assets or documentation without maintainer approval.

## Start here

- [Open the public web app](https://dannyiswandyy.github.io/Mrt-app/).
- Check [existing issues](https://github.com/dannyiswandyy/Mrt-app/issues) before creating a new one.
- Use the dedicated **Bug**, **Train run / timetable**, **Map / station**, or **Feature request** form.
- See [features](docs/features.md), [FAQ](docs/faq.md), and [data sources](docs/data-sources.md) for context.

## Make a useful rail-data report

Please include:

1. **Line, station code, direction and service date** in Singapore time (UTC+8).
2. The **run/slot** shown, if one is available, and the exact UI label or time that looks wrong.
3. The **expected result** with source: for example an LTA timetable, official operational notice, or an on-site observation.
4. A screenshot or reproducible steps. Crop out personal information or credentials.

**Important:** A scheduled train run is a timetable duty, **not** a vehicle fleet number. Do not describe a particular trainset as confirmed from GTFS slot data alone. Trains on the map may be modelled or timetable-estimated rather than continuously GPS-tracked. For duty terms, see [FAQ](docs/faq.md).

## Before changing source code

Read [`AGENTS.md`](AGENTS.md). In particular:

- Fetch the newest `main` first. Other contributors and automated tools may update the app frequently.
- The public page is in `web/index.html`; the Android build packages it. Do **not** create divergent public features or replace the website with promotional material.
- Do not force-push to `main` or remove safety gates from GitHub Actions.
- Keep train arrows on the correct side of the track for direction of travel.
- Keep secrets out of all commits, screenshots and logs. Never commit API tokens or private test APKs.
- Respect image, map, brand and font licenses. Cite third-party sources.

## Testing checklist

Run the tests that apply to your changes:

```bash
node tests/syntax-check.mjs
node tests/timetable-check.js
node tests/duty-classification.test.mjs
node tests/extension-opening.test.mjs
node tests/special-events.test.mjs
node tests/page-starts.mjs
```

Some browser tests require Playwright and a configured runtime. If any test cannot run locally, say so in your PR; do not mark it passed. Verify Android and web changes together, including narrow phones and tablet widths where possible. For code affecting builds, review the relevant GitHub Actions workflow and safety checks.

## Pull request guidelines

Use the [pull request template](.github/PULL_REQUEST_TEMPLATE.md) and explain:

- What changed, why, and which public surface is affected.
- Before/after UI screenshots for visual changes.
- Data source and uncertainty for train-related logic.
- Tests run and any remaining limitations.

Keep PRs focused so regressions can be traced easily. A report or PR does not imply its feature will ship.

## Community behaviour

Be constructive, specific and respectful. Do not post private identifiers, credentials, harassment, or photos that lack the right to redistribute. For security-sensitive discoveries, consult the repository's [security options](https://github.com/dannyiswandyy/Mrt-app/security) rather than posting exploit details in public issues.

**MRT Spotter is an independent fan-made app**; it is not endorsed by LTA, SMRT, SBS Transit or any transport operator.

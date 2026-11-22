# Make the GitHub repository look its best

[← Documentation](README.md) · [Main README](../README.md)

Most parts of the project landing page are controlled by files in this repository. **GitHub's native About sidebar, topics and social-preview upload must be set in the GitHub repository UI**; the docs-only makeover does not silently change them.

## About sidebar

On the repo homepage, select the **gear icon beside About** and enter:

**Description**

> Singapore MRT/LRT enthusiast tracker with 2D/3D maps, train runs, spotting tools, trip planning and rail intelligence.

**Website**

> https://dannyiswandyy.github.io/Mrt-app/

**Topics** (space-separated, as GitHub topics):

`singapore` `mrt` `lrt` `rail` `public-transport` `train-tracker` `android` `github-pages` `train-spotting` `timetable` `railfan` `transit`

Keep the repository public and avoid describing timetable-inferred trains as confirmed live GPS positions.

## Social-preview image

The repository includes an editable [social-preview artwork](assets/social-preview.svg) designed around the **current white-front train launcher icon** and MRT-inspired rail lines.

GitHub's social-preview uploader generally needs a raster image (PNG/JPEG). Export the SVG at **1280 × 640 PNG** before uploading, or use the separately provided matching PNG if available.

To apply it on GitHub:

1. Open **Settings → General** for this repository.
2. Scroll to **Social preview**.
3. Choose **Edit** / **Upload an image**.
4. Upload the 1280 × 640 PNG.
5. Check that sharing `https://github.com/dannyiswandyy/Mrt-app` shows the new image (some platforms cache previews).

The SVG file is a design source, not proof that the account-level social preview has already changed.

## Navigation and links

- **[Main README](../README.md)** — landing page, main features, download links.
- **[Feature guide](features.md)** — what is available to the public.
- **[Screenshot guide](screenshots.md)** — how to use authentic screen captures.
- **[Issues](https://github.com/dannyiswandyy/Mrt-app/issues/new/choose)** — useful reporting forms.
- **[Releases](https://github.com/dannyiswandyy/Mrt-app/releases/latest)** — Android APK and update notes.

Do not replace the running web tracker with a promotional page. A future marketing microsite should use a **separate path or deployment** so the existing URL remains functional.

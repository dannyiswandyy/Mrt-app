#!/usr/bin/env python3
"""Builds the MRT Tracker website (web/index.html, web/livecam.html) from the NORMAL Android app.

    python3 web/tools/make_web.py [.github/workflows/build-android.yml] [web]

It reads the app page that build-android.yml packs (MRT Tracker, the beta/normal channel, not MRT Dev),
and makes the few changes a browser needs:
  * the page's security policy allows this site's own files, the data relay (Cloudflare Worker) and
    YouTube's player, with script-src 'unsafe-inline' (no fingerprints);
  * a small stand-in for the app's Android bridge (window.MrtApp) is added. It loads the timetable and
    buildings from web/data/, sends LTA, news and YouTube requests through the relay set in config.js,
    and leaves out what only the phone app can do (in-app updates, timetable download, the home widget,
    Android notifications and trip alarms);
  * the Live cam uses web/livecam.html on this site instead of the app's built-in player address;
  * a few messages say "unavailable on this website" instead of talking about the phone app;
  * the web app manifest and service worker (offline start) are linked.
Run it again after the app changes; every change is checked, so a change that no longer fits stops with an error.
"""
import base64, gzip, lzma, re, sys, time, os

SRC = sys.argv[1] if len(sys.argv) > 1 else ".github/workflows/build-android.yml"
OUT = sys.argv[2] if len(sys.argv) > 2 else "web"
wf = open(SRC, encoding="utf-8").read().split("\n")

def heredoc(target):
    """The lines of the heredoc that writes `target` in the "Write the app project" step."""
    for i, l in enumerate(wf):
        if ("'" + target + "'") in l and "MRTAPP_EOF" in l:
            j = next(k for k in range(i + 1, len(wf)) if wf[k].strip() == "MRTAPP_EOF")
            return l, [x[10:] if x.startswith(" " * 10) else x.strip() for x in wf[i + 1:j]]
    raise SystemExit(f"{target} isn't in {SRC}")

head, body = heredoc("mrt-tracker-app/app/src/main/assets/index.html")
raw = base64.b64decode("".join(x.strip() for x in body))
page = (gzip.decompress(raw) if "gunzip" in head else lzma.decompress(raw) if "xz -d" in head else raw).decode("utf-8") \
    if "base64 -d" in head else "\n".join(body) + "\n"
_, cam = heredoc("mrt-tracker-app/app/src/main/assets/livecam.html")
cam = "\n".join(cam) + "\n"

def sub(old, new, count=1, regex=False):
    global page
    n = len(re.findall(old, page)) if regex else page.count(old)
    if n != count:
        raise SystemExit(f"make_web: expected {count} × {old[:70]!r}, found {n}")
    page = re.sub(old, lambda m: new, page) if regex else page.replace(old, new)

# 1. Security policy for a website. connect-src: this site, NEA weather (sends CORS headers itself) and the
#    relay (any *.workers.dev; add your own domain here if the relay gets one).
CSP = ("default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src https://fonts.gstatic.com; img-src 'self' data: https://server.arcgisonline.com https://i.ytimg.com; "
       "connect-src 'self' https://api-open.data.gov.sg https://*.workers.dev; media-src 'none'; object-src 'none'; "
       "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; worker-src 'self'; manifest-src 'self'; "
       "base-uri 'none'; form-action 'none'")
sub(r'<meta http-equiv="Content-Security-Policy" content="[^"]*">', f'<meta http-equiv="Content-Security-Policy" content="{CSP}">', regex=True)

# 2. Web app basics.
sub('<title>MRT Train Tracker</title>', '<title>MRT Train Tracker</title>\n<meta name="description" content="Live map of Singapore\'s MRT and LRT trains, next trains, disruptions and crowds.">\n'
    '<meta name="theme-color" content="#14181d">\n<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icons/icon.svg" type="image/svg+xml">\n'
    '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">')

# 3. The bridge stand-in runs first; the app's own script waits until the timetable is in.
BRIDGE = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "bridge.js"), encoding="utf-8").read()
BRIDGE = BRIDGE.replace("__BUILD__", time.strftime("%Y.%m.%d-%H%M", time.gmtime(time.time() + 8 * 3600)))
sub("\n<script>\n", '\n<script src="config.js"></script>\n<script>\n' + BRIDGE.rstrip() + '\n</script>\n<script type="text/plain" id="mrt-main">\n')

# 4. Live cam player: this site's own copy of the app's player page.
sub('const CAM_APP_PLAYER = "https://sg.mrttracker.app/livecam.html";', 'const CAM_APP_PLAYER = new URL("livecam.html", location.href).href;')

# 5. Messages for a website without live data.
WEB_OFF = '(window.MRT_WEB && !MRT_WEB.live)'
sub('b.innerHTML = `<div class="alert off"><b>Live disruption alerts aren\'t included in this version of the app</b></div>`;',
    'b.innerHTML = ' + WEB_OFF + ' ? `<div class="alert off"><b>Live data unavailable</b><span class="sub">Trains and next-train times still work. LTA alerts, crowds and news aren\'t available on this website right now.</span></div>`'
    ' : `<div class="alert off"><b>Live disruption alerts aren\'t included in this version of the app</b></div>`;')
sub('<p class="muted">Live disruption alerts aren\'t included in this version of the app.</p>',
    '<p class="muted">${' + WEB_OFF + ' ? "Live disruption alerts aren\'t available on this website right now. Check SMRT or SBS Transit on X for updates." : "Live disruption alerts aren\'t included in this version of the app."}</p>')
sub('"Not included in this version of the app."', '(' + WEB_OFF + ' ? "Unavailable on this website right now." : "Not included in this version of the app.")')
sub('note.textContent = loading ? "Loading recent reports…" : "No Singapore rail news from the past week.";',
    'note.textContent = loading ? "Loading recent reports…" : ' + WEB_OFF + ' ? "Rail news isn\'t available on this website right now." : "No Singapore rail news from the past week.";')

for bad in ("sha" + "256-", "integ" + "rity="):
    if bad in page or bad in cam:
        raise SystemExit(f"make_web: {bad} is still in the page")

# livecam.html: the app sends its policy as a header; a website file carries it in the page.
CAM_CSP = ("default-src 'none'; script-src 'unsafe-inline' https://www.youtube.com https://s.ytimg.com; "
           "frame-src https://www.youtube.com https://www.youtube-nocookie.com; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'")
if cam.count('<meta charset="utf-8">') != 1:
    raise SystemExit("make_web: livecam.html changed")
cam = cam.replace('<meta charset="utf-8">', f'<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="{CAM_CSP}">')
cam = cam.replace("The app serves this page at https://sg.mrttracker.app/livecam.html\n   (it never comes from the internet), so YouTube can tell which app is showing its video.",
                  "On the website it is served next to index.html, so YouTube can tell which site is showing its video.")

open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(page)
open(os.path.join(OUT, "livecam.html"), "w", encoding="utf-8").write(cam)
print(f"web/index.html {len(page.encode()):,} bytes, web/livecam.html {len(cam.encode()):,} bytes")

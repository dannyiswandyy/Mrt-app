#!/usr/bin/env python3
"""Use OneMap's public-transport rail routing to refine LRT track geometry.

OneMap is the authoritative Singapore national map. This optional step uses a
repository secret ONEMAP_TOKEN and never blocks a build: if the token is absent
or a route cannot be obtained, the existing URA/OSM geometry is kept.

Only the LRT lines are overridden. MRT/URA geometry remains unchanged.
"""
import json, math, os, re, sys, urllib.parse, urllib.request, datetime

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
ASSETS = os.path.join(ROOT, "app", "src", "main", "assets")
PAGE = os.path.join(ASSETS, "index.html")
OUT = os.path.join(ASSETS, "tracks.json")
TOKEN = os.environ.get("ONEMAP_TOKEN", "").strip()
API = "https://www.onemap.gov.sg/api/public/routingsvc/route"

LAT0, LON0 = 1.3521, 103.8198
KX = 111320 * math.cos(math.radians(LAT0))
KY = 110574

LRT = {
    "BP": re.compile(r"^BP\d+$"),
    "SE": re.compile(r"^SE\d+$"),
    "SW": re.compile(r"^SW\d+$"),
    "PE": re.compile(r"^PE\d+$"),
    "PW": re.compile(r"^PW\d+$"),
}

def xy(lat, lon):
    return (lon - LON0) * KX, -(lat - LAT0) * KY

def decode_polyline(s):
    # Google-compatible encoded polyline: OneMap route_geometry format.
    out, lat, lon, i = [], 0, 0, 0
    while i < len(s):
        vals = []
        for _ in range(2):
            shift = result = 0
            while True:
                if i >= len(s): return []
                b = ord(s[i]) - 63; i += 1
                result |= (b & 0x1f) << shift
                shift += 5
                if b < 0x20: break
            vals.append(-(result >> 1) - 1 if result & 1 else result >> 1)
        lat += vals[0]; lon += vals[1]
        out.append(xy(lat / 1e5, lon / 1e5))
    return out

def page_map():
    html = open(PAGE, encoding="utf-8").read()
    m = re.search(r"^const MAP = (\{.*\});\s*$", html, re.M)
    if not m:
        raise RuntimeError("MAP not found")
    return json.loads(m.group(1))

def route(start, end):
    d = datetime.date.today()
    q = urllib.parse.urlencode({
        "start": f"{start[0]},{start[1]}",
        "end": f"{end[0]},{end[1]}",
        "routeType": "pt",
        "date": d.strftime("%m-%d-%Y"),
        "time": "12:00:00",
        "mode": "rail",
        "maxWalkDistance": "0",
        "numItineraries": "1",
    })
    req = urllib.request.Request(API + "?" + q, headers={
        "Authorization": TOKEN,
        "User-Agent": "MRTTracker-OneMap-Rail/1.0",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        j = json.loads(r.read().decode())
    if j.get("status") not in (0, "0"):
        raise RuntimeError(j.get("status_message") or "route failed")
    geom = j.get("route_geometry") or ""
    pts = decode_polyline(geom)
    if len(pts) < 2:
        raise RuntimeError("no usable rail geometry")
    return pts

def simplify(pts, tol=3):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0]-a[0], b[1]-a[1]
    L = math.hypot(dx, dy) or 1e-9
    best, idx = 0, 0
    for i, p in enumerate(pts[1:-1], 1):
        dist = abs(dy*p[0] - dx*p[1] + b[0]*a[1] - b[1]*a[0]) / L
        if dist > best: best, idx = dist, i
    if best <= tol: return [a,b]
    return simplify(pts[:idx+1], tol)[:-1] + simplify(pts[idx:], tol)

def main():
    if not TOKEN:
        print("OneMap rail refinement skipped: ONEMAP_TOKEN is not configured.")
        return
    try:
        M = page_map()
        tracks = json.load(open(OUT, encoding="utf-8"))
    except Exception as e:
        print(f"OneMap rail refinement skipped: {e}")
        return

    changed = []
    for code, pat in LRT.items():
        seq = []
        for c in M.get("stations", {}):
            if pat.fullmatch(c): seq.append(c)
        # Preserve the page's actual line order rather than dictionary order.
        lm = re.search(r"\n  " + code + r":\{name:"[^"]+"[^\n]*?stations:\[(.*?)\]\}", open(PAGE, encoding="utf-8").read())
        if lm:
            ordered = re.findall(r'\["([A-Z]+\d*)","', lm.group(1))
            if ordered: seq = [c for c in ordered if c in M["stations"]]
        if len(seq) < 2: continue

        paths = []
        ok = True
        for a, b in zip(seq, seq[1:]):
            A = M["stations"][a]; B = M["stations"][b]
            # MAP coordinates are metres east/south; convert back to WGS84.
            alat = LAT0 - A[1] / KY; alon = LON0 + A[0] / KX
            blat = LAT0 - B[1] / KY; blon = LON0 + B[0] / KX
            try:
                pts = route((alat, alon), (blat, blon))
                # Force exact app station endpoints so train placement stays continuous.
                pts[0], pts[-1] = tuple(A), tuple(B)
                paths.append([v for p in simplify(pts, 3) for v in (round(p[0]), round(p[1]))])
            except Exception as e:
                print(f"OneMap {code} {a}-{b} skipped: {e}")
                ok = False
                break
        if ok and len(paths) == len(seq)-1:
            tracks.setdefault("paths", {})[code] = paths
            changed.append(code)

    if changed:
        tracks["onemap"] = changed
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(tracks, f, separators=(",", ":"))
        print("OneMap rail geometry applied to:", ", ".join(changed))
    else:
        print("OneMap returned no complete LRT geometry; keeping existing tracks.json.")

if __name__ == "__main__":
    main()

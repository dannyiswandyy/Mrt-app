#!/usr/bin/env python3
"""Use OneMap public-transport rail routing to refine LRT track geometry.

The OneMap account credentials are read only from the build environment. A fresh
short-lived access token is requested at build time, so no token is bundled in
the APK or website.
"""
import datetime, json, math, os, sys, urllib.parse, urllib.request

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
ASSETS = os.path.join(ROOT, "app", "src", "main", "assets")
PAGE = os.path.join(ASSETS, "index.html")
OUT = os.path.join(ASSETS, "tracks.json")

EMAIL = os.environ.get("ONEMAP_EMAIL", "").strip()
PASSWORD = os.environ.get("ONEMAP_PASSWORD", "")
TOKEN = os.environ.get("ONEMAP_TOKEN", "").strip()
AUTH_API = "https://www.onemap.gov.sg/api/auth/post/getToken"
ROUTE_API = "https://www.onemap.gov.sg/api/public/routingsvc/route"

LAT0, LON0 = 1.3521, 103.8198
KX = 111320 * math.cos(math.radians(LAT0))
KY = 110574

# Exact operating order used by the app. STC is the Sengkang/Punggol interchange
# station and BP6 is the Bukit Panjang loop endpoint.
LRT_ORDER = {
    "BP": ["BP6","BP7","BP8","BP9","BP10","BP11","BP12","BP13","BP6"],
    "SE": ["STC","SE1","SE2","SE3","SE4","SE5","STC"],
    "SW": ["STC","SW1","SW2","SW3","SW4","SW5","SW6","SW7","SW8","STC"],
    "PE": ["PTC","PE1","PE2","PE3","PE4","PE5","PE6","PE7","PTC"],
    "PW": ["PTC","PW1","PW2","PW3","PW4","PW5","PW6","PW7","PTC"],
}

def xy(lat, lon):
    return (lon - LON0) * KX, -(lat - LAT0) * KY

def decode_polyline(s):
    out, lat, lon, i = [], 0, 0, 0
    while i < len(s):
        vals = []
        for _ in range(2):
            shift = result = 0
            while True:
                if i >= len(s):
                    return []
                b = ord(s[i]) - 63
                i += 1
                result |= (b & 0x1f) << shift
                shift += 5
                if b < 0x20:
                    break
            vals.append(-(result >> 1) - 1 if result & 1 else result >> 1)
        lat += vals[0]
        lon += vals[1]
        out.append(xy(lat / 1e5, lon / 1e5))
    return out

def page_map():
    html = open(PAGE, encoding="utf-8").read()
    marker = "const MAP = "
    start = html.find(marker)
    if start < 0:
        raise RuntimeError("MAP not found")
    start += len(marker)
    end = html.find(";\n", start)
    if end < 0:
        raise RuntimeError("MAP terminator not found")
    return json.loads(html[start:end])

def get_token():
    if TOKEN:
        return TOKEN
    if not EMAIL or not PASSWORD:
        return ""
    body = json.dumps({"email": EMAIL, "password": PASSWORD}).encode()
    req = urllib.request.Request(
        AUTH_API,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "MRTTracker-OneMap-Rail/1.1"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        j = json.loads(r.read().decode())
    token = (j.get("access_token") or "").strip()
    if not token:
        raise RuntimeError("OneMap authentication returned no access_token")
    return token

def route(start, end, token):
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
    req = urllib.request.Request(
        ROUTE_API + "?" + q,
        headers={"Authorization": token, "User-Agent": "MRTTracker-OneMap-Rail/1.1"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        j = json.loads(r.read().decode())
    if j.get("status") not in (0, "0"):
        raise RuntimeError(j.get("status_message") or j.get("error") or "route failed")
    pts = decode_polyline(j.get("route_geometry") or "")
    if len(pts) < 2:
        raise RuntimeError("no usable rail geometry")
    return pts

def simplify(pts, tol=3):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy) or 1e-9
    best, idx = 0, 0
    for i, p in enumerate(pts[1:-1], 1):
        dist = abs(dy*p[0] - dx*p[1] + b[0]*a[1] - b[1]*a[0]) / length
        if dist > best:
            best, idx = dist, i
    if best <= tol:
        return [a, b]
    return simplify(pts[:idx+1], tol)[:-1] + simplify(pts[idx:], tol)

def main():
    try:
        token = get_token()
        if not token:
            print("OneMap rail refinement skipped: no ONEMAP credentials/token configured.")
            return
        M = page_map()
        tracks = json.load(open(OUT, encoding="utf-8"))
    except Exception as e:
        print(f"OneMap rail refinement skipped: {e}")
        return

    changed = []
    for code, seq in LRT_ORDER.items():
        if any(c not in M.get("stations", {}) for c in seq):
            print(f"OneMap {code} skipped: one or more app stations are missing")
            continue
        paths, ok = [], True
        for a, b in zip(seq, seq[1:]):
            A, B = M["stations"][a], M["stations"][b]
            alat, alon = LAT0 - A[1] / KY, LON0 + A[0] / KX
            blat, blon = LAT0 - B[1] / KY, LON0 + B[0] / KX
            try:
                pts = route((alat, alon), (blat, blon), token)
                pts[0], pts[-1] = tuple(A), tuple(B)
                flat = [v for p in simplify(pts, 3) for v in (round(p[0]), round(p[1]))]
                if len(flat) < 4:
                    raise RuntimeError("route geometry collapsed to a line segment")
                paths.append(flat)
            except Exception as e:
                print(f"OneMap {code} {a}-{b} skipped: {e}")
                ok = False
                break
        if ok and len(paths) == len(seq) - 1:
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

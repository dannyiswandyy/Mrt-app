"""Pack building outlines and heights around every station for the 3D buildings on the simple map.

Runs on GitHub during every build:  python3 tools/build_buildings.py <app project folder> [cache folder]
After a fresh download it also writes "osm-fresh" next to the cache folder, so the workflow saves the new copy.

Buildings come from OpenStreetMap (data (c) OpenStreetMap contributors, ODbL), through the Overpass
API. A copy is kept in the cache folder between builds, so OpenStreetMap is only asked again once a
month, or when stations change. If the download fails, the last saved copy is used; with neither,
the app simply shows no buildings. This step never fails the build.

buildings.json:
  v: 1, src: attribution, at: "YYYY-MM-DD", r: radius in metres, q: metres per unit, key: station set
  b: [[height m, x, y, dx, dy, dx, dy, ...], ...]  outline in units of q, first point then steps,
     in the map's own metres (x east, y south of central Singapore), sorted north to south
"""
import hashlib, json, math, os, re, shutil, sys, time, urllib.error, urllib.parse, urllib.request

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
CACHE = sys.argv[2] if len(sys.argv) > 2 else None
ASSETS = os.path.join(ROOT, "app/src/main/assets")
OUT = os.path.join(ASSETS, "buildings.json")
SUMMARY = os.environ.get("GITHUB_STEP_SUMMARY")
ENDPOINTS = [u for u in os.environ.get("OVERPASS_URLS", "").split() if u] or [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.private.coffee/api/interpreter"]
RADIUS = 400          # metres around each station
Q = 0.5               # metres per stored unit
BATCH = 8             # stations per Overpass request (smaller parts answer faster and fail less)
TRY_SECONDS = 90      # longest wait for one server, so one stuck server can't use up the whole time
PART_SECONDS = 150    # longest time spent on one part before moving on to the next
MAX_AGE_DAYS = 30
DEADLINE = time.time() + float(os.environ.get("BUILDINGS_MAX_SECONDS", 8 * 60))   # stop asking after 8 minutes, so a slow day can't hold up the build
LEVEL_M = 3.2
# Same projection as the map (build_map.py): metres east and south of central Singapore.
LAT0, LON0 = 1.3521, 103.8198
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110574
# Typical heights in levels, for buildings without a height or level count.
LEVELS = {"apartments": 12, "residential": 10, "hdb": 12, "dormitory": 8, "hotel": 15, "office": 10, "commercial": 6,
          "retail": 3, "mall": 5, "hospital": 8, "school": 4, "university": 5, "college": 4, "public": 4, "civic": 4,
          "government": 5, "industrial": 3, "warehouse": 3, "factory": 3, "train_station": 2, "transportation": 2,
          "parking": 6, "multi-storey_car_park": 6, "garage": 1, "garages": 1, "house": 2, "detached": 2,
          "semidetached_house": 2, "terrace": 2, "bungalow": 2, "church": 2, "mosque": 2, "temple": 2,
          "religious": 2, "shed": 1, "hut": 1, "kiosk": 1, "service": 1, "carport": 1, "roof": 1, "toilets": 1}
SKIP = {"no", "construction", "proposed", "demolished", "abandoned", "ruins", "bridge"}
report = []


def say(line=""):
    print(line)
    report.append(line)


def finish():
    if SUMMARY:
        with open(SUMMARY, "a") as f:
            f.write("## 3D buildings\n\n" + "\n".join(report) + "\n")
    sys.exit(0)


def station_points():
    """Station positions from the map data in the app's page, joined where they're close together."""
    html = open(os.path.join(ASSETS, "index.html"), encoding="utf-8").read()
    m = re.search(r'const MAP = \{"stations":(\{[^{}]*\})', html)
    pts = list(json.loads(m.group(1)).values())
    out = []
    for x, y in sorted(pts):
        if not any(math.hypot(x - a, y - b) < 150 for a, b in out):
            out.append((x, y))
    return out


def to_latlon(x, y):
    return LAT0 - y / KY, LON0 + x / KX


def to_xy(lat, lon):
    return (lon - LON0) * KX, -(lat - LAT0) * KY


def overpass(points):
    parts = []
    for x, y in points:
        lat, lon = to_latlon(x, y)
        a = f"(around:{RADIUS},{lat:.6f},{lon:.6f})"
        parts.append(f'way["building"]{a};relation["building"]["type"="multipolygon"]{a};')
    query = f"[out:json][timeout:{TRY_SECONDS}];({''.join(parts)});out tags geom qt;"
    data = urllib.parse.urlencode({"data": query}).encode()
    last = None
    stop = min(DEADLINE, time.time() + PART_SECONDS)
    for attempt in range(2):
        # start with the server that answered last time, then try the other mirrors
        for k in range(len(ENDPOINTS)):
            url = ENDPOINTS[(GOOD[0] + k) % len(ENDPOINTS)]
            left = stop - time.time()
            if left < 5:
                raise RuntimeError(("out of time" if stop >= DEADLINE else "no answer in time") + (f"; last problem: {last}" if last else ""))
            try:
                req = urllib.request.Request(url, data=data, headers={"User-Agent": "MRTTracker-build/1.0 (GitHub Actions; 3D station buildings)"})
                with urllib.request.urlopen(req, timeout=min(TRY_SECONDS + 15, left)) as r:
                    j = json.loads(r.read().decode("utf-8"))
                if "elements" in j and not j.get("remark", "").lower().startswith("runtime error"):
                    GOOD[0] = ENDPOINTS.index(url)
                    return j["elements"]
                last = urllib.parse.urlsplit(url).netloc + ": " + str(j.get("remark", "no elements"))[:120]
            except Exception as e:
                last = urllib.parse.urlsplit(url).netloc + f": {type(e).__name__}: {e}"
            time.sleep(2 + attempt * 5)
    raise RuntimeError(last)


GOOD = [0]            # index of the server that answered last


def part_file(points):
    """Where one part's buildings are kept between builds, so a part that downloaded isn't asked for again."""
    k = hashlib.sha1(json.dumps([RADIUS, Q, [(round(x, -1), round(y, -1)) for x, y in points]]).encode()).hexdigest()[:12]
    return os.path.join(CACHE, "parts", k + ".json") if CACHE else None


def num(v):
    m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*(m|metres?|meters?|ft|feet|')?\s*$", str(v or ""), re.I)
    if not m:
        return None
    n = float(m.group(1))
    return n * 0.3048 if m.group(2) and m.group(2).lower() in ("ft", "feet", "'") else n


def height(tags):
    h = num(tags.get("height"))
    if h and 1 <= h <= 600:
        return h
    lv = num(tags.get("building:levels"))
    if lv and 0 < lv <= 150:
        return max(3.0, lv * LEVEL_M + (num(tags.get("roof:levels")) or 0) * LEVEL_M * 0.5)
    return LEVELS.get(tags.get("building", "yes"), 3) * LEVEL_M


def simplify(pts, tol):
    if len(pts) < 4:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1
        L = math.hypot(dx, dy) or 1e-9
        best, bi = 0, -1
        for i in range(a + 1, b):
            d = abs((pts[i][0] - x1) * dy - (pts[i][1] - y1) * dx) / L
            if d > best:
                best, bi = d, i
        if best > tol and bi > 0:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def simplify_ring(pts, tol):
    """Simplify a closed outline (first point not repeated): split it at the point farthest from
    the start and simplify each half, since both ends of a closed line are the same point."""
    if len(pts) < 5:
        return pts
    far = max(range(len(pts)), key=lambda i: math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]))
    a = simplify(pts[:far + 1], tol)
    b = simplify(pts[far:] + [pts[0]], tol)
    return a[:-1] + b[:-1]


def area(pts):
    return abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))) / 2


def rings(el):
    """Outer rings of a building, as lists of (lat, lon)."""
    if el["type"] == "way":
        g = el.get("geometry") or []
        return [[(p["lat"], p["lon"]) for p in g if p]]
    segs = [[(p["lat"], p["lon"]) for p in m.get("geometry") or [] if p] for m in el.get("members", [])
            if m.get("type") == "way" and m.get("role", "outer") in ("outer", "")]
    segs = [s for s in segs if len(s) >= 2]
    out = []
    while segs:
        ring = segs.pop(0)
        grew = True
        while ring[0] != ring[-1] and grew:
            grew = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]:
                    ring += s[1:]
                elif s[-1] == ring[-1]:
                    ring += s[::-1][1:]
                else:
                    continue
                segs.pop(i)
                grew = True
                break
        out.append(ring)
    return out


def pack(elements, rows=False):
    """Packed outlines; with rows=True, [id, y, outline] rows so parts can be joined without repeats."""
    seen, out = set(), []
    for el in elements:
        k = (el.get("type"), el.get("id"))
        if k in seen:
            continue
        seen.add(k)
        tags = el.get("tags") or {}
        if tags.get("building", "yes") in SKIP or (tags.get("location") == "underground"):
            continue
        h = height(tags)
        for ring in rings(el):
            pts = [to_xy(lat, lon) for lat, lon in ring]
            if len(pts) > 1 and pts[0] == pts[-1]:
                pts = pts[:-1]
            if len(pts) < 3 or area(pts) < 15:
                continue
            pts = simplify_ring(pts, 0.8)
            if len(pts) < 3:
                continue
            u = [(round(x / Q), round(y / Q)) for x, y in pts]
            flat = [int(round(min(h, 400)))] + list(u[0])
            for (ax, ay), (bx, by) in zip(u, u[1:]):
                flat += [bx - ax, by - ay]
            out.append((sum(p[1] for p in pts) / len(pts), flat, f"{k[0][0]}{k[1]}"))
    if rows:
        return [[i, round(y, 1), f] for y, f, i in out]
    out.sort(key=lambda t: t[0])
    return [f for _, f, _ in out]


def use(path, why):
    os.makedirs(ASSETS, exist_ok=True)
    shutil.copyfile(path, OUT)
    j = json.load(open(OUT))
    say(f"{why}: {len(j['b']):,} buildings from OpenStreetMap, downloaded {j['at']} ({os.path.getsize(OUT) / 1e6:.1f} MB).")


def main():
    pts = station_points()
    key = hashlib.sha1(json.dumps([(round(x, -1), round(y, -1)) for x, y in pts]).encode()).hexdigest()[:12]
    cached = os.path.join(CACHE, "buildings.json") if CACHE else None
    old = None
    if cached and os.path.exists(cached):
        try:
            old = json.load(open(cached))
        except Exception:
            old = None
    if old and old.get("v") == 1 and old.get("key") == key and old.get("r") == RADIUS:
        age = (time.time() - time.mktime(time.strptime(old["at"], "%Y-%m-%d"))) / 86400
        if age < MAX_AGE_DAYS:
            use(cached, "✅ Using the saved copy")
            return
    say(f"Downloading buildings within {RADIUS} m of {len(pts)} station areas from OpenStreetMap…")
    rows, failed, fetched, reused = {}, 0, 0, 0
    parts = math.ceil(len(pts) / BATCH)
    for n, i in enumerate(range(0, len(pts), BATCH)):
        chunk = pts[i:i + BATCH]
        pf = part_file(chunk)
        try:
            saved = json.load(open(pf)) if pf and os.path.exists(pf) else None
            if saved and (time.time() - time.mktime(time.strptime(saved["at"], "%Y-%m-%d"))) / 86400 < MAX_AGE_DAYS:
                for r in saved["rows"]:
                    rows[r[0]] = r
                reused += 1
                continue
        except Exception:
            pass
        if time.time() > DEADLINE - 5:      # out of time: skip the download, but still use any saved parts
            failed += 1
            continue
        try:                                # one part failing doesn't stop the others
            got = pack(overpass(chunk), rows=True)
            for r in got:
                rows[r[0]] = r
            fetched += 1
            if pf:
                os.makedirs(os.path.dirname(pf), exist_ok=True)
                with open(pf, "w") as f:
                    json.dump({"at": time.strftime("%Y-%m-%d"), "rows": got}, f, separators=(",", ":"))
        except Exception as e:
            failed += 1
            say(f"⚠️ Part {n + 1} of {parts} didn't download ({e}).")
        time.sleep(1)
    if reused:
        say(f"♻️ {reused} of {parts} parts came from the copy saved by an earlier build.")
    if failed:
        say(f"⚠️ {failed} of {parts} parts didn't download this time; the next build asks only for those.")
    if fetched and CACHE:
        # tells the workflow there are new parts worth saving, so the next build carries on from here
        open(os.path.join(os.path.dirname(os.path.abspath(CACHE)), "osm-fresh"), "w").write(time.strftime("%Y-%m-%d"))
    if failed and old:
        use(cached, f"⚠️ {failed} of {parts} parts didn't download, so the app keeps the saved copy")
        return
    b = [r[2] for r in sorted(rows.values(), key=lambda r: r[1])]
    if not b and old:
        use(cached, "⚠️ No buildings came back, so the app keeps the saved copy")
        return
    if not b:
        say("⚠️ No buildings came back, so the map will show none this time.")
        if os.path.exists(OUT):
            os.remove(OUT)
        return
    j = {"v": 1, "src": "© OpenStreetMap contributors", "at": time.strftime("%Y-%m-%d"), "r": RADIUS, "q": Q, "key": key, "b": b}
    os.makedirs(ASSETS, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(j, f, separators=(",", ":"))
    if CACHE and not failed:
        os.makedirs(CACHE, exist_ok=True)
        shutil.copyfile(OUT, cached)
        # tells the workflow there's a new copy worth saving for next time
        open(os.path.join(os.path.dirname(os.path.abspath(CACHE)), "osm-fresh"), "w").write(j["at"])
    say(f"✅ {len(b):,} buildings packed ({os.path.getsize(OUT) / 1e6:.1f} MB)" + (f"; {failed} of {parts} parts missing, so some stations have no buildings." if failed else "."))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        say(f"⚠️ The buildings step hit an error ({type(e).__name__}: {e}). The map will show no buildings.")
    finish()

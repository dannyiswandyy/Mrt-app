#!/usr/bin/env python3
"""MRT and LRT track shapes from URA's Master Plan rail lines (data.gov.sg), for the MRT Dev map.

Danny wanted to try URA's rail geometry instead of SG Rail Data's. The page draws each line as one track piece
per pair of neighbouring stations (MAP.paths in index.html). This script downloads URA's rail lines, and for
every piece of every MRT line finds the way along URA's lines from one station to the next that stays closest
to the piece the app already has (so it follows the right line where two run side by side, and never takes a
future line). The pieces go into tracks.json (the same file as the RTS Link and Sentosa Express tracks), which
the page reads through APP.getTracks(). Stations then move onto URA's line ("stations" in tracks.json), so
the line keeps URA's shape instead of bending to SG Rail Data's station points. A piece that can't be matched
keeps its SG Rail Data shape, joined to the moved stations.

Reads index.html (doesn't change it). Run after build_tracks.py, which writes tracks.json first.
usage: build_ura_rail.py <android-dir> [cache-dir]
"""
import heapq, json, math, os, re, sys, urllib.request

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
CACHE = sys.argv[2] if len(sys.argv) > 2 else None
ASSETS = os.path.join(ROOT, "app", "src", "main", "assets")
PAGE = os.path.join(ASSETS, "index.html")
OUT = os.path.join(ASSETS, "tracks.json")
SUMMARY = os.environ.get("GITHUB_STEP_SUMMARY")
DATASETS = ["d_e8bf3cff62f97300817d1fdcce382584", "d_6615da031916f656152eafa013748d73"]   # Master Plan rail line
API = "https://api-open.data.gov.sg/v1/public/api/datasets/{}/poll-download"
LINES = ["NSL", "EWL", "CG", "NEL", "CCL", "DTL", "TEL"]
LRT_LINES = ["BP", "SE", "SW", "PE", "PW"]   # matched only to what URA marks as LRT, so they never take an MRT line's track
# Same projection as the map (build_map.py): metres east and south of central Singapore.
LAT0, LON0 = 1.3521, 103.8198
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110574
STEP = 20         # URA lines are split into points at most this far apart (metres)
JOIN = 25         # loose ends of URA lines this close to another line are joined to it
BRIDGE = 350      # a gap this long is bridged where a line stops and carries on straight ahead
TURN = 8          # how much more a way costs where it runs across the app's piece instead of along it
NEAR = 300        # a station must be this close to URA's lines
WIDE = 40         # how far a way may stray from the app's piece before it costs a lot more
MAXOFF = 250      # a matched piece may never be further than this from the app's piece
report = []


def say(line=""):
    print(line)
    report.append(line)


def finish(code=0):
    if SUMMARY:
        with open(SUMMARY, "a") as f:
            f.write("## URA MRT and LRT tracks\n\n" + "\n".join(report) + "\n")
    sys.exit(code)


def fetch(url, headers=None, timeout=60):
    req = urllib.request.Request(url, headers=dict({"User-Agent": "MRT-Dev/ura-tracks"}, **(headers or {})))
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def download():
    """URA's rail lines as GeoJSON, from data.gov.sg (or the build cache if that fails)."""
    cache = os.path.join(CACHE, "ura-rail.geojson") if CACHE else None
    key = os.environ.get("DATA_GOV_SG_API_KEY")
    for ds in DATASETS:
        try:
            meta = json.loads(fetch(API.format(ds), {"x-api-key": key} if key else None, 30))
            if meta.get("code") != 0:
                raise RuntimeError(meta.get("errMsg") or "request failed")
            raw = fetch(meta["data"]["url"])
            fc = json.loads(raw)
            if not fc.get("features"):
                raise RuntimeError("no features")
            say(f"- Downloaded data.gov.sg dataset `{ds}`: {len(fc['features'])} features.")
            if cache:
                os.makedirs(CACHE, exist_ok=True)
                with open(cache, "wb") as f:
                    f.write(raw)
            return fc
        except Exception as e:
            say(f"- data.gov.sg dataset `{ds}` didn't download: {e}")
    if cache and os.path.exists(cache):
        say("- Using the URA rail lines saved by an earlier build.")
        with open(cache) as f:
            return json.load(f)
    return None


def page_map():
    """MAP (stations and track pieces) from the page, read only."""
    with open(PAGE, encoding="utf-8") as f:
        html = f.read()
    m = re.search(r"^const MAP = (\{.*\});\s*$", html, re.M)
    if not m:
        raise RuntimeError("MAP not found in index.html")
    return json.loads(m.group(1))


def is_mrt(props):
    """Keep MRT lines: drop what URA marks as LRT (its rail type field, or data.gov.sg's packed Description)."""
    props = props or {}
    for k, v in props.items():
        if "TYPE" in k.upper() and isinstance(v, str):
            return "LRT" not in v.upper()
    d = json.dumps(props).upper()
    return not ("LRT" in d and "MRT" not in d)


def lines_of(fc, lrt=False):
    """URA's MRT lines (or, with lrt=True, its LRT lines) as lists of map points."""
    out = []
    for f in fc.get("features", []):
        if is_mrt(f.get("properties")) == lrt:
            continue
        g = f.get("geometry") or {}
        parts = [g.get("coordinates")] if g.get("type") == "LineString" else g.get("coordinates") if g.get("type") == "MultiLineString" else []
        for part in parts or []:
            pts = [((c[0] - LON0) * KX, -(c[1] - LAT0) * KY) for c in part if c and len(c) >= 2]
            if len(pts) >= 2:
                out.append(pts)
    return out


class Graph:
    def __init__(self, polylines):
        self.xy, self.adj, self.cell = [], [], {}
        ids = {}

        def node(p):
            k = (round(p[0] / 2), round(p[1] / 2))      # points within ~2 m are the same point
            if k not in ids:
                ids[k] = len(self.xy)
                self.xy.append(p); self.adj.append([])
                self.cell.setdefault((int(p[0] // 100), int(p[1] // 100)), []).append(ids[k])
            return ids[k]

        def edge(a, b):
            if a == b:
                return
            d = math.dist(self.xy[a], self.xy[b])
            self.adj[a].append((b, d)); self.adj[b].append((a, d))

        ends = []                                   # (node, the way the line points out of that end)
        for pl in polylines:
            prev = None
            for i in range(len(pl)):
                if i:
                    a, b = pl[i - 1], pl[i]
                    n = max(1, math.ceil(math.dist(a, b) / STEP))
                    for k in range(1, n + 1):
                        cur = node((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
                        edge(prev, cur); prev = cur
                else:
                    prev = node(pl[0])
            for e, p, q in ((pl[0], pl[0], pl[1]), (pl[-1], pl[-1], pl[-2])):
                d = math.dist(p, q) or 1
                ends.append((node(e), ((p[0] - q[0]) / d, (p[1] - q[1]) / d)))
        # join loose ends (URA draws a line in several pieces) to the nearest other point
        for e, _ in ends:
            near = [n for n in self.near(self.xy[e], JOIN) if n != e and all(n != b for b, _ in self.adj[e])]
            if near:
                edge(e, min(near, key=lambda n: math.dist(self.xy[n], self.xy[e])))
        # bridge gaps where a line stops and carries on straight ahead (URA leaves gaps, e.g. at stations), but
        # never across to a line going another way
        for i, (e, u) in enumerate(ends):
            best = None
            for f, v in ends[i + 1:]:
                p, q = self.xy[e], self.xy[f]
                d = math.dist(p, q)
                if f == e or d < 1 or d > BRIDGE:
                    continue
                g = ((q[0] - p[0]) / d, (q[1] - p[1]) / d)
                if u[0] * g[0] + u[1] * g[1] > 0.94 and -(v[0] * g[0] + v[1] * g[1]) > 0.94 and (not best or d < best[0]):
                    best = (d, f)
            if best and all(best[1] != b for b, _ in self.adj[e]):
                edge(e, best[1])

    def near(self, p, r):
        cx, cy, k = int(p[0] // 100), int(p[1] // 100), int(r // 100) + 1
        out = []
        for i in range(cx - k, cx + k + 1):
            for j in range(cy - k, cy + k + 1):
                for n in self.cell.get((i, j), ()):
                    if math.dist(self.xy[n], p) <= r:
                        out.append(n)
        return out


def seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def poly_dist(p, pts):
    return min(seg_dist(p, pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def length(pts):
    return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def simplify(pts, eps=2.0):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        best, bi = 0, -1
        for k in range(i + 1, j):
            d = seg_dist(pts[k], pts[i], pts[j])
            if d > best:
                best, bi = d, k
        if best > eps:
            keep[bi] = True; stack += [(i, bi), (bi, j)]
    return [p for p, k in zip(pts, keep) if k]


def match(G, old, longest=1.25, near=NEAR, maxoff=MAXOFF):
    """URA's way from the first point of `old` to the last, staying close to `old`; None if there isn't one."""
    A, B = old[0], old[-1]
    starts, goals = G.near(A, near), set(G.near(B, near))
    if not starts or not goals:
        return None, "a station is too far from URA's lines"
    cache = {}

    def off(n, x=None, y=None):
        """How far node n (or the point x, y) is from the app's piece, and which way the piece runs there."""
        if n is None:
            return dirat((x, y))[1]
        if n not in cache:
            cache[n] = dirat(G.xy[n])
        return cache[n]

    def dirat(p):
        best = (math.inf, (1, 0))
        for i in range(len(old) - 1):
            a, b = old[i], old[i + 1]
            d = seg_dist(p, a, b)
            if d < best[0]:
                L = math.dist(a, b) or 1
                best = (d, ((b[0] - a[0]) / L, (b[1] - a[1]) / L))
        return best

    dist, prev, heap = {}, {}, []
    for s in starts:
        d0 = math.dist(G.xy[s], A) * 1.5
        dist[s] = d0; heapq.heappush(heap, (d0, s))
    end, best = None, math.inf
    while heap:
        d, n = heapq.heappop(heap)
        if d > dist.get(n, math.inf) or d >= best:
            continue
        if n in goals:
            total = d + math.dist(G.xy[n], B) * 1.5
            if total < best:
                best, end = total, n
        for m, w in G.adj[n]:
            o, v = off(m)
            if o > maxoff:
                continue
            a, b = G.xy[n], G.xy[m]
            across = 1 - abs((b[0] - a[0]) * v[0] + (b[1] - a[1]) * v[1]) / (w or 1)   # 0 along the piece, 1 across
            nd = d + w * (1 + (o / WIDE) ** 2) * (1 + TURN * across)
            if nd < dist.get(m, math.inf):
                dist[m] = nd; prev[m] = n; heapq.heappush(heap, (nd, m))
    if end is None:
        return None, "no way along URA's lines between the stations"
    way = [end]
    while way[-1] in prev:
        way.append(prev[way[-1]])
    way.reverse()
    pts = [A] + [G.xy[n] for n in way] + [B]
    ratio = length(pts) / max(1, length(old))
    if not 0.8 <= ratio <= longest:
        return None, f"URA's way is {ratio:.2f}× as long"
    back = max(poly_dist(p, pts) for p in old)
    if back > maxoff:
        return None, f"URA's way misses the old piece by {back:.0f} m"
    way = [G.xy[n] for n in way]
    # Trim the ends where the way runs across the app's piece: that's another line's track it borrowed to get
    # to the old station point (e.g. the North-South Line's at Woodlands for the Thomson-East Coast Line).
    def along(i, j):
        a, b = way[i], way[j]
        L = math.dist(a, b) or 1
        v = off(None, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        return abs((b[0] - a[0]) * v[0] + (b[1] - a[1]) * v[1]) / L > 0.7      # within about 45 degrees
    while len(way) > 2 and not along(0, 1):
        way.pop(0)
    while len(way) > 2 and not along(-2, -1):
        way.pop()

    # ...and where the way turns sharply near an end: real track curves gently, so a sharp turn there is where
    # it stepped onto another line's track
    def turn(i):
        a, b, c = way[i - 1], way[i], way[i + 1]
        u, v = (b[0] - a[0], b[1] - a[1]), (c[0] - b[0], c[1] - b[1])
        L = (math.hypot(*u) * math.hypot(*v)) or 1
        return (u[0] * v[0] + u[1] * v[1]) / L < math.cos(math.radians(35))
    k, run = 1, 0.0
    while k < len(way) - 1 and run < 300:
        if turn(k):
            way = way[k:]; k = 1; run = 0.0; continue
        run += math.dist(way[k - 1], way[k]); k += 1
    k, run = len(way) - 2, 0.0
    while k > 0 and run < 300:
        if turn(k):
            way = way[:k + 1]; k = len(way) - 2; run = 0.0; continue
        run += math.dist(way[k], way[k + 1]); k -= 1
    if len(way) < 2:
        return None, "too short"
    return way, ""                              # URA's own points, without the old station points


PREFIX = {"NSL": "NS", "EWL": "EW", "CG": "CG", "NEL": "NE", "CCL": "CC", "DTL": "DT", "TEL": "TE",
          "BP": "BP", "SE": "SE", "SW": "SW", "PE": "PE", "PW": "PW"}
SNAP = 400        # a station moves onto URA's line if the line is this close (SG Rail Data puts many
                  # interchange platforms on one point, though the real ones can be a few hundred metres apart)
LRT_SNAP = 200    # LRT stations are close together, so they move less
LRT_NEAR = 120    # LRT pieces can be under 400 m, so they look for URA's line closer to the stations (else
                  # the search could start and finish at the same point and skip the track between)
LRT_HUB_NEAR = 250  # ...unless URA's line isn't that close, as at Punggol
LRT_LONGEST = 1.8 # SG Rail Data draws many LRT pieces as straight lines, so URA's curving track can be much longer
                  # (Senja to Bukit Panjang is 1.62x)


def project(p, pts):
    """Nearest point to p on the polyline pts: (distance, segment index, point)."""
    best = (math.inf, 0, pts[0])
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = dx * dx + dy * dy
        t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
        q = (a[0] + t * dx, a[1] + t * dy)
        d = math.dist(p, q)
        if d < best[0]:
            best = (d, i, q)
    return best


def main():
    try:
        M = page_map()
    except Exception as e:
        say(f"- Couldn't read the map from the page: {e}"); finish()
    fc = download()
    if not fc:
        say("- No URA rail lines: the app keeps SG Rail Data's tracks."); finish()
    pls, lrt = lines_of(fc), lines_of(fc, lrt=True)
    say(f"- {len(pls)} MRT and {len(lrt)} LRT line pieces from URA.")
    if not pls and not lrt:
        finish()
    graphs = {"MRT": Graph(pls) if pls else None, "LRT": Graph(lrt) if lrt else None}
    try:
        with open(OUT) as f:
            tracks = json.load(f)
    except Exception:
        tracks = {}
    tracks.setdefault("paths", {}); ura = []      # (tracks.json's "src" is build_tracks.py's)
    tracks["stations"] = tracks.get("stations") or {}
    total = done = moved = 0
    for c in LINES + LRT_LINES:
        cur = M["paths"].get(c)
        is_lrt = c in LRT_LINES
        G = graphs["LRT" if is_lrt else "MRT"]
        if not cur or G is None:
            continue
        pre = PREFIX[c]
        snap = LRT_SNAP if is_lrt else SNAP
        at = {}                                   # old station point -> this line's station code there
        for code, xy in M["stations"].items():
            if re.fullmatch(pre + r"\d*", code):
                at.setdefault(tuple(xy), code)
        olds, ways, misses = [], [], []
        for i, flat in enumerate(cur):
            old = [(flat[k], flat[k + 1]) for k in range(0, len(flat), 2)]
            if is_lrt:
                way, why = match(G, old, LRT_LONGEST, LRT_NEAR)
            elif c == "NEL" and {at.get(old[0]), at.get(old[-1])} == {"NE16", "NE17"}:
                # Punggol's NEL piece is more curved than the old SG Rail Data straight segment.
                # Retry only this piece with a wider path envelope; the normal matcher remains the first choice.
                way, why = match(G, old, 1.25, NEAR)
                if not way:
                    first_why = why
                    way, why = match(G, old, 1.6, NEAR, 350)
                    if way:
                        say(f"- NEL NE16-NE17 needed the wider URA match ({first_why}).")
            else:
                way, why = match(G, old, 1.25, NEAR)
            if is_lrt and not way and why.startswith("a station is too far"):
                # URA's LRT line can stop well short of a hub station (Punggol, Sengkang): look further out there
                way, why = match(G, old, LRT_LONGEST, LRT_HUB_NEAR)
            total += 1
            olds.append(old); ways.append(way if way and len(way) >= 2 else None)
            if ways[-1]:
                done += 1
            else:
                misses.append(f"{i} ({why or 'too short'})")
        # Move each station onto URA's line (the nearest point of the matched pieces next to it), so the
        # tracks keep URA's real shape instead of bending to where SG Rail Data put the station.
        # URA often leaves a gap where a station is (its line stops at one end of the station and starts again at
        # the other): a station with a gap goes in the gap, on the straight line between the two ends.
        near, inn, out = {}, {}, {}
        for old, way in zip(olds, ways):
            if way:
                inn.setdefault(old[-1], way[-1]); out.setdefault(old[0], way[0])
        for end in set(inn) & set(out):
            e, f = inn[end], out[end]
            if 1 < math.dist(e, f) <= BRIDGE + 150:
                d, _, q = project(end, [e, f])
                if d <= snap:
                    near[end] = (-1, q)                       # always wins
        for old, way in zip(olds, ways):
            if way:
                for end in (old[0], old[-1]):
                    d, _, q = project(end, way)
                    if d <= snap and d < near.get(end, (math.inf,))[0]:
                        near[end] = (d, q)
        new = {end: q for end, (d, q) in near.items()}
        for end, q in new.items():
            code = at.get(end)
            if code:
                tracks["stations"][code] = [round(q[0]), round(q[1])]
                moved += 1
        segs = []
        for old, way in zip(olds, ways):
            A, B = new.get(old[0], old[0]), new.get(old[-1], old[-1])
            if way:
                _, ka, _ = project(A, way)
                _, kb, _ = project(B, way)
                mid = way[ka + 1:kb + 1] if ka <= kb else way
                pts = simplify([A] + mid + [B])
            else:
                pts = [A] + old[1:-1] + [B]       # SG Rail Data's shape, joined to the moved stations
            # drop little zigzags (a sharp turn on a step under 15 m, where URA's pieces overlap)
            k = 1
            while k < len(pts) - 1:
                a, b, c2 = pts[k - 1], pts[k], pts[k + 1]
                u, v = (b[0] - a[0], b[1] - a[1]), (c2[0] - b[0], c2[1] - b[1])
                L = math.hypot(*u) * math.hypot(*v)
                if L and (u[0] * v[0] + u[1] * v[1]) / L < 0.6 and min(math.hypot(*u), math.hypot(*v)) < 15:
                    pts.pop(k); k = max(1, k - 1)
                else:
                    k += 1
            segs.append([v for p in pts for v in (round(p[0]), round(p[1]))])
        tracks["paths"][c] = segs
        ura.append(c)
        say(f"- {c}: {len(cur) - len(misses)} of {len(cur)} pieces from URA" + (f"; kept SG Rail Data for {', '.join(misses)}" if misses else ""))
    tracks["ura"] = ura
    with open(OUT, "w") as f:
        json.dump(tracks, f, separators=(",", ":"))
    say(f"- {done} of {total} MRT and LRT track pieces now follow URA's lines; {moved} station points moved onto them -> {OUT}")
    finish()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Extract indicative future rail geometry from URA Master Plan, for Dev overlay only.

Uses the same official URA GeoJSON cache already downloaded by build_ura_rail.py.
Matches future routes by geographic corridor proximity; a match is indicative,
not evidence that a specific rail line, station or alignment is final.
Does not modify existing/current rail geometry.
"""
import json, math, os, re, sys
from pathlib import Path

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
CACHE = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("osm-cache")
SRC = ROOT / "app/src/main/assets/future-rail.js"
OUT = ROOT / "app/src/main/assets/future-rail-geometry.json"
URA = CACHE / "ura-rail.geojson"
LAT0, LON0 = 1.3521, 103.8198
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110574

def dist(p,a,b):
    dx,dy=b[0]-a[0],b[1]-a[1]
    k=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy or 1)))
    return math.hypot(p[0]-a[0]-k*dx,p[1]-a[1]-k*dy)

def main():
    source=SRC.read_text(encoding="utf-8")
    # The shared JS declares route nodes with the simple P(code,name,x,y[,existing]) format.
    routes={}
    for code,body in re.findall(r'\{id:"([^"]+)",name:.*?nodes:\[(.*?)\]\}',source,re.S):
        xy=[(int(x),int(y)) for x,y in re.findall(r'P\(".*?","[^"]*",(-?\d+),(-?\d+)',body)]
        if len(xy)>1 and code not in ("SEL","TGL"):
            routes[code]=xy
    result={"source":"URA Master Plan 2025/2019 rail lines (data.gov.sg)","method":"corridor-proximity candidates, indicative only","matched":{}}
    if not URA.exists():
        print("No downloaded URA cache; future overlay retains illustrative fallback.")
        OUT.write_text(json.dumps(result,separators=(",",":")),encoding="utf-8")
        return
    features=json.loads(URA.read_text(encoding="utf-8")).get("features",[])
    for code,anchors in routes.items():
        pieces=[]
        for feature in features:
            geo=feature.get("geometry") or {}
            coords=geo.get("coordinates") or []
            blocks=[coords] if geo.get("type")=="LineString" else coords if geo.get("type")=="MultiLineString" else []
            for block in blocks:
                pts=[((q[0]-LON0)*KX,(LAT0-q[1])*KY) for q in block if len(q)>1]
                if len(pts)<2: continue
                # Keep only URA polylines following a defined, announced corridor.
                # Reject features that are merely crossing the corridor.
                closeness=[min(dist(p,anchors[i],anchors[i+1]) for i in range(len(anchors)-1)) for p in pts]
                if max(closeness)>400 or sum(closeness)/len(closeness)>175:continue
                if math.hypot(pts[-1][0]-pts[0][0],pts[-1][1]-pts[0][1])<80:continue
                simp=[pts[0]]
                for p in pts[1:-1]:
                    if math.dist(p,simp[-1])>40:simp.append(p)
                simp.append(pts[-1])
                if len(simp)>250:simp=simp[::max(1,len(simp)//250)]
                pieces.append([[round(x),round(y)] for x,y in simp])
        if pieces:result["matched"][code]=pieces
    OUT.write_text(json.dumps(result,separators=(",",":")),encoding="utf-8")
    print("Future URA candidate segments by corridor:",{k:len(v) for k,v in result["matched"].items()})

if __name__=="__main__":main()

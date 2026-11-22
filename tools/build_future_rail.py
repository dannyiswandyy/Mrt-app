#!/usr/bin/env python3
"""Validate the offline future-rail alignment asset before release.

The checked-in station-pair sections retain their original URA OBJECTIDs or
OSM way IDs. Do not infer project ownership solely from the nearest railway.
"""
import json
import math
import sys
from pathlib import Path


def validate(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema") != 2 or not data.get("sections"):
        raise ValueError("Missing station-pair geometry")
    count = 0
    for route, sections in data["sections"].items():
        seen = set()
        for section in sections:
            pair = section["from"], section["to"]
            if pair in seen or pair[0] == pair[1] or not section["parts"]:
                raise ValueError(f"{route} has an invalid section: {pair}")
            seen.add(pair)
            if section.get("source", "ura") not in data["sources"]:
                raise ValueError(f"{route} {pair} has no source")
            for part in section["parts"]:
                points = part["xy"]
                if not isinstance(part["id"], int) or len(points) < 2:
                    raise ValueError(f"{route} {pair} has invalid linework")
                if any(len(p) != 2 or not all(math.isfinite(n) for n in p) for p in points):
                    raise ValueError(f"{route} {pair} has invalid coordinates")
            count += 1
    print(f"Verified bundled future geometry for {count} station pairs.")


if __name__ == "__main__":
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    validate(root / "app/src/main/assets/future-rail-geometry.json")

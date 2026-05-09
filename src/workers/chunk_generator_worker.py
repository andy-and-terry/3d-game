#!/usr/bin/env python3
import json
import sys


def build_chunk(payload):
    x = int(payload.get("x", 0))
    y = int(payload.get("y", 0))
    seed = int(payload.get("seed", 0))
    biome = "plains" if (x + y + seed) % 2 == 0 else "forest"

    return {
        "id": f"{x}_{y}",
        "x": x,
        "y": y,
        "seed": seed,
        "biome": biome,
        "height": (x * 31 + y * 17 + seed) % 100,
    }


def main():
    raw = sys.stdin.read()
    payload = json.loads(raw or "{}")
    chunk = build_chunk(payload)
    sys.stdout.write(json.dumps(chunk))


if __name__ == "__main__":
    main()

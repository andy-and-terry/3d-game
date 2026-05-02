#!/usr/bin/env python3
"""
gen/generator.py – Minimal terrain heightmap generator

Protocol
--------
  stdin  ← one JSON line:   {"seed": <int>, "size": <int>}
  stdout → one JSON line:   {"size": <int>, "heights": [<float>, …]}

The heights array is row-major (size*size elements) with values in [0, 1].
The renderer scales them by HEIGHT_SCALE (see renderer.js).

Implementation
--------------
Pure-Python, no external dependencies required.  Uses sin/cos layering
(a cheap multi-octave approximation) so the project runs without pip.

TO SWAP TO NUMPY / MORE REALISTIC NOISE:
  Uncomment the numpy block below and replace the pure-Python loop.
  For proper Simplex / OpenSimplex noise:
    pip install opensimplex
    from opensimplex import OpenSimplex
    gen = OpenSimplex(seed=seed)
    h = gen.noise2(x * freq, y * freq)   # returns -1…1

python_embed note
-----------------
  If you bundle a python_embed runtime, point spawn() in src/main.js to:
    path.join(process.resourcesPath, 'python_embed', 'python.exe')
  No other changes are needed here.
"""

import sys
import json
import math


# ---------------------------------------------------------------------------
# Pure-Python multi-octave heightmap (no external deps)
# ---------------------------------------------------------------------------

def _fade(t: float) -> float:
    """Smoothstep curve used in gradient noise."""
    return t * t * t * (t * (t * 6 - 15) + 10)


def _lerp(a: float, b: float, t: float) -> float:
    return a + t * (b - a)


def _grad(h: int, x: float, y: float) -> float:
    """Simple 2D gradient from hash value."""
    h &= 3
    if h == 0:
        return  x + y
    if h == 1:
        return -x + y
    if h == 2:
        return  x - y
    return -x - y


def _perlin2(x: float, y: float, perm: list) -> float:
    """Single-octave Perlin-like noise returning approx -1…1."""
    xi = int(math.floor(x)) & 255
    yi = int(math.floor(y)) & 255
    xf = x - math.floor(x)
    yf = y - math.floor(y)
    u  = _fade(xf)
    v  = _fade(yf)
    aa = perm[perm[xi    ] + yi    ]
    ab = perm[perm[xi    ] + yi + 1]
    ba = perm[perm[xi + 1] + yi    ]
    bb = perm[perm[xi + 1] + yi + 1]
    return _lerp(
        _lerp(_grad(aa, xf,     yf    ), _grad(ba, xf - 1, yf    ), u),
        _lerp(_grad(ab, xf,     yf - 1), _grad(bb, xf - 1, yf - 1), u),
        v
    )


def _make_perm(seed: int) -> list:
    """Build a 512-length permutation table from the given seed."""
    import random
    rng = random.Random(seed)
    p = list(range(256))
    rng.shuffle(p)
    return (p + p)  # doubled to avoid index wrapping


def generate_heightmap(seed: int, size: int) -> list:
    """
    Generate a size×size heightmap using multi-octave Perlin-like noise.

    Returns a flat list of size*size floats in [0, 1], row-major.
    """
    perm = _make_perm(seed)
    heights = []

    # Octave parameters – tweak for different terrain character
    octaves    = 6
    persistence = 0.5
    lacunarity  = 2.0
    base_freq   = 3.0 / size   # scale so the whole map shows ~3 "hills"

    for row in range(size):
        for col in range(size):
            value    = 0.0
            amplitude = 1.0
            frequency = base_freq
            max_val   = 0.0

            for _ in range(octaves):
                nx = col * frequency
                ny = row * frequency
                value    += _perlin2(nx, ny, perm) * amplitude
                max_val  += amplitude
                amplitude *= persistence
                frequency *= lacunarity

            # Normalise to [0, 1]
            heights.append((value / max_val + 1.0) * 0.5)

    return heights


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    raw = sys.stdin.readline().strip()
    if not raw:
        print(json.dumps({"error": "empty input"}), file=sys.stderr)
        sys.exit(1)

    try:
        opts = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"invalid JSON: {exc}"}), file=sys.stderr)
        sys.exit(1)

    seed = int(opts.get("seed", 0))
    size = int(opts.get("size", 64))

    # Clamp to sane bounds
    size = max(4, min(size, 1024))

    heights = generate_heightmap(seed, size)
    sys.stdout.write(json.dumps({"size": size, "heights": heights}))
    sys.stdout.write("\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()

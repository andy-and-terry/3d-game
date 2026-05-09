"""
Terrain heightmap generator.
Reads JSON opts from stdin, writes JSON heightmap data to stdout.

opts: { seed: int, size: int, octaves: int, scale: float }
Output: { heightmap: [[float,...]], size: int, seed: int }
"""
import sys
import json
import math
import random


def lerp(a, b, t):
    return a + t * (b - a)


def fade(t):
    return t * t * t * (t * (t * 6 - 15) + 10)


class PerlinNoise:
    def __init__(self, seed=0):
        rng = random.Random(seed)
        self.p = list(range(256))
        rng.shuffle(self.p)
        self.p = self.p * 2

    def _grad(self, h, x, y):
        h = h & 3
        if h == 0: return  x + y
        if h == 1: return -x + y
        if h == 2: return  x - y
        return -x - y

    def noise(self, x, y):
        xi = int(math.floor(x)) & 255
        yi = int(math.floor(y)) & 255
        xf = x - math.floor(x)
        yf = y - math.floor(y)
        u, v = fade(xf), fade(yf)
        aa = self.p[self.p[xi] + yi]
        ab = self.p[self.p[xi] + yi + 1]
        ba = self.p[self.p[xi + 1] + yi]
        bb = self.p[self.p[xi + 1] + yi + 1]
        x1 = lerp(self._grad(aa, xf, yf),     self._grad(ba, xf - 1, yf),     u)
        x2 = lerp(self._grad(ab, xf, yf - 1), self._grad(bb, xf - 1, yf - 1), u)
        return (lerp(x1, x2, v) + 1) / 2  # normalise to [0, 1]


def generate(seed, size, octaves, scale):
    pn = PerlinNoise(seed)
    heightmap = []
    for y in range(size):
        row = []
        for x in range(size):
            h = 0.0
            amp = 1.0
            freq = 1.0
            max_amp = 0.0
            for _ in range(octaves):
                h += pn.noise(x / size * scale * freq, y / size * scale * freq) * amp
                max_amp += amp
                amp *= 0.5
                freq *= 2.0
            row.append(h / max_amp)
        heightmap.append(row)
    return heightmap


def main():
    raw = sys.stdin.read()
    opts = json.loads(raw) if raw.strip() else {}
    seed    = opts.get('seed', 42)
    size    = opts.get('size', 64)
    octaves = opts.get('octaves', 6)
    scale   = opts.get('scale', 4.0)

    heightmap = generate(seed, size, octaves, scale)
    result = {'heightmap': heightmap, 'size': size, 'seed': seed}
    sys.stdout.write(json.dumps(result))
    sys.stdout.flush()


if __name__ == '__main__':
    main()

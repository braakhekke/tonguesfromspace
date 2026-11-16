#!/usr/bin/env python3
"""Writes the decorative shapes of the front page (images/home/shape-*.svg). They are used by css/home.css ("seams and fillers") as CSS masks or backgrounds.
Purely decorative: stylised, not data. The spark is a shape of the old logo; shape-logo.svg (the ice of the new mark) is written by scripts/build_logo.py; the ridge, the ice front, the pixel row and the contours are drawn here from a fixed seed, so a rerun gives the same files.
Run: python3 scripts/build_home_shapes.py"""
import math, os, random

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "images", "home")
BLACK = "#000"      # the masks only use the shape (alpha); the colour comes from the CSS token


def write(name, svg):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(svg.strip() + "\n")
    print(name, len(svg), "bytes")


def f1(v):
    return ("%.1f" % v).rstrip("0").rstrip(".")


def spark():
    # the four-point star of the logo (.spark)
    write("shape-spark.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="150 22 28 28"><path fill="{BLACK}" d="M164 24 Q165 35 176 36 Q165 37 164 48 Q163 37 152 36 Q163 35 164 24 Z"/></svg>')


def ridge():
    """A mountain skyline, filled below the line. 1600 x 120, stretched to the width of the page (preserveAspectRatio none).
    The middle fifth is low (the valley of a glacier), the sides rise to sharp peaks."""
    rnd = random.Random(7)
    pts, x = [], 0
    while x <= 1600:
        t = x / 1600
        valley = 1 - math.exp(-((t - .5) / .13) ** 2) * .78      # 1 at the sides, about .22 in the middle
        base = (.55 + .45 * abs(math.sin(t * 9.7 + .6)) * (.6 + .4 * math.sin(t * 3.1 + 1.2) ** 2)) * valley
        pts.append((x, 120 - 12 - base * 98 * (.78 + .22 * rnd.random())))
        x += rnd.choice([34, 46, 58, 72])
    d = "M0 120 L0 %s " % f1(pts[0][1]) + " ".join("L%s %s" % (f1(px), f1(py)) for px, py in pts) + " L1600 %s L1600 120 Z" % f1(pts[-1][1])
    write("shape-ridge.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 120" preserveAspectRatio="none"><path fill="{BLACK}" d="{d}"/></svg>')


def icefront():
    """The front of a glacier, hanging from a flat top: seracs, each a slab with a sloped face that ends in a sheer drop, of very different width and depth. 1600 x 64."""
    rnd = random.Random(33)
    pts, x = [], 0
    while x < 1600:
        w = rnd.choice([44, 70, 104, 150, 210])
        top = rnd.choice([10, 16, 22, 30])        # depth where the slab's face starts (next to the drop on its left)
        low = rnd.choice([34, 44, 52, 60])        # depth where it ends (next to the drop on its right)
        if rnd.random() < .5:
            top, low = low, top
        pts.append((x, top)); pts.append((min(x + w, 1600), low))
        x += w
    d = "M0 0 H1600 V%d " % pts[-1][1] + " ".join("L%d %d" % (px, py) for px, py in reversed(pts)) + " Z"
    write("shape-icefront.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 64" preserveAspectRatio="none"><path fill="{BLACK}" d="{d}"/></svg>')


def logo():      # no longer called: shape-logo.svg is written by scripts/build_logo.py (the new mark, 2026-11-16)
    """The old whole mark of the logo (mountain with the open mouth, the tongue with its groove), as the logo of the page draws it (home.html, .why-logo), for a mask."""
    write("shape-logo.svg", f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 8 190 180"><defs>
<mask id="m" maskUnits="userSpaceOnUse" x="-20" y="-20" width="240" height="240"><rect x="-20" y="-20" width="240" height="240" fill="#fff"/><ellipse cx="100" cy="88" rx="48" ry="24" fill="#000"/></mask>
<mask id="g" maskUnits="userSpaceOnUse" x="-20" y="-20" width="240" height="240"><rect x="-20" y="-20" width="240" height="240" fill="#fff"/><path d="M92 90 C112 108 126 136 126 166" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/></mask></defs>
<g fill="{BLACK}"><path d="M4 100 L62 20 L90 56 L102 44 L120 60 L144 44 L188 100 Z" mask="url(#m)"/><path d="M74 86 C92 104 82 136 82 158 A44 24 0 0 0 170 158 C170 134 134 108 110 86 Q92 78 74 86 Z" mask="url(#g)"/></g></svg>''')


def pixels():
    """Square pixels (the size of a Sentinel-2 pixel, as a picture) that thin out upwards: the bottom row full, then 78 %, 45 %, 18 %. 384 x 48, repeats sideways."""
    rnd = random.Random(2016)
    s, cols, rows = 12, 32, 4
    prob = [1.0, .78, .45, .18]      # from the bottom row up
    cells = []
    for r in range(rows):
        y = (rows - 1 - r) * s
        for c in range(cols):
            if rnd.random() < prob[r]:
                cells.append(f'<rect x="{c * s}" y="{y}" width="{s}" height="{s}"/>')
    write("shape-pixels.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {cols * s} {rows * s}" shape-rendering="crispEdges"><g fill="{BLACK}">{"".join(cells)}</g></svg>')


def contours():
    """Topographic lines around a glacier-shaped hill, 1 px, one dashed red ring (the former extent, decorative). Own colours: it is used as a background picture, not as a mask."""
    rnd = random.Random(1984)
    ph = [rnd.random() * 6.28 for _ in range(4)]
    paths = []
    n, steps = 15, 90
    for k in range(n):
        r0 = 34 + k * 24
        pts = []
        for i in range(steps):
            a = 2 * math.pi * i / steps
            wob = 1 + .10 * math.sin(2 * a + ph[0] + k * .11) + .07 * math.sin(3 * a + ph[1] - k * .09) + .035 * math.sin(5 * a + ph[2] + k * .2)
            r = r0 * wob * (1 + .0012 * k * k * math.sin(a + ph[3]))
            x, y = r * math.cos(a) * 1.28, r * math.sin(a) * .8      # long and flat, like a valley
            c, s_ = math.cos(-.42), math.sin(-.42)
            pts.append((400 + x * c - y * s_ + k * 3, 400 + x * s_ + y * c))
        d = "M" + " L".join("%s %s" % (f1(px), f1(py)) for px, py in pts) + "Z"
        if k == 6:
            paths.append(f'<path d="{d}" fill="none" stroke="#C8322A" stroke-opacity=".42" stroke-width="1.8" stroke-dasharray="7 6"/>')
        else:
            paths.append(f'<path d="{d}" fill="none" stroke="#2D6E8E" stroke-opacity="{.16 if k % 5 == 0 else .09}" stroke-width="{1.4 if k % 5 == 0 else 1}"/>')
    write("shape-contours.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">{"".join(paths)}</svg>')


if __name__ == "__main__":
    spark(); ridge(); icefront(); pixels(); contours()

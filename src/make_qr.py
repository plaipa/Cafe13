#!/usr/bin/env python3
"""Makes the table QR code for the menu page.

    python3 src/make_qr.py                         # https://caffe13.ir/menu/
    python3 src/make_qr.py https://example.com/menu/

Needs:  pip install qrcode pillow
Writes: qr/menu-qr.svg (vector, for print) and qr/menu-qr.png (2000 px).

Error correction is the highest level (H), so the small logo in the middle
does not stop phones from scanning it.
"""
import re
import sys
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
url = sys.argv[1] if len(sys.argv) > 1 else 'https://caffe13.ir/menu/'
out = root / 'qr'
out.mkdir(exist_ok=True)

qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, border=0, box_size=1)
qr.add_data(url)
qr.make(fit=True)
m = qr.get_matrix()
n = len(m)
quiet = 4                       # quiet zone, in modules (the QR standard asks for 4)
size = n + 2 * quiet
ink, paper = '#111111', '#FFFFFF'

# The logo sits in a white round pad in the middle, about 20% of the width.
logo_w = round(n * 0.20)
pad = logo_w + 2
c = size / 2

def under_logo(x, y):
    return (x + .5 - n / 2) ** 2 + (y + .5 - n / 2) ** 2 < (pad / 2) ** 2

# --- SVG: one path for all dark modules ---------------------------------------
d = []
for y, row in enumerate(m):
    x = 0
    while x < n:
        if row[x] and not under_logo(x, y):
            x0 = x
            while x < n and row[x] and not under_logo(x, y):
                x += 1
            d.append(f'M{x0 + quiet} {y + quiet}h{x - x0}v1h-{x - x0}z')
        else:
            x += 1

logo_svg = (root / 'assets/brand/logo.svg').read_text(encoding='utf-8')
inner = re.search(r'<svg[^>]*>(.*)</svg>', logo_svg, re.S).group(1)
s = logo_w / 1000
svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" role="img" aria-label="QR code: {url}">'
    f'<rect width="{size}" height="{size}" fill="{paper}"/>'
    f'<path d="{"".join(d)}" fill="{ink}" shape-rendering="crispEdges"/>'
    f'<circle cx="{c}" cy="{c}" r="{pad / 2}" fill="{paper}"/>'
    f'<g transform="translate({c - logo_w / 2} {c - logo_w / 2}) scale({s})">{inner}</g>'
    f'</svg>\n'
)
(out / 'menu-qr.svg').write_text(svg, encoding='utf-8')

# --- PNG, 2000 px --------------------------------------------------------------
scale = 2000 // size
px = size * scale
img = Image.new('RGB', (px, px), paper)
dr = ImageDraw.Draw(img)
for y, row in enumerate(m):
    for x, v in enumerate(row):
        if v and not under_logo(x, y):
            X, Y = (x + quiet) * scale, (y + quiet) * scale
            dr.rectangle([X, Y, X + scale - 1, Y + scale - 1], fill=ink)
r = pad / 2 * scale
dr.ellipse([c * scale - r, c * scale - r, c * scale + r, c * scale + r], fill=paper)
lw = int(logo_w * scale)
logo = Image.open(root / 'assets/brand/logo-1024.png').convert('RGBA').resize((lw, lw), Image.LANCZOS)
img.paste(logo, (int(c * scale - lw / 2), int(c * scale - lw / 2)), logo)
img.save(out / 'menu-qr.png', optimize=True)

print(f'{url}  ->  {n}x{n} modules, qr/menu-qr.svg ({len(svg):,} bytes), qr/menu-qr.png ({px}px)')

#!/usr/bin/env python3
"""Builds the two static pages from src/*.template.html.

    python3 src/build.py

  index.html        the cafe's page (story, map, address, hours)
  menu/index.html   the menu page (the table QR code points here)

Placeholders: {{BASE}} path back to the site root, {{GLYPH}} the "13" outline
from assets/brand/logo-mark.svg, {{MAP}} the map from src/partials/map.html.
"""
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
glyph = re.search(r' d="([^"]+)"', (root / 'assets/brand/logo-mark.svg').read_text(encoding='utf-8')).group(1)
map_html = (root / 'src/partials/map.html').read_text(encoding='utf-8').rstrip('\n')

pages = [
    ('src/index.template.html', 'index.html', ''),
    ('src/menu.template.html', 'menu/index.html', '../'),
]
for src, out, base in pages:
    html = (root / src).read_text(encoding='utf-8')
    html = html.replace('{{MAP}}', map_html).replace('{{GLYPH}}', glyph).replace('{{BASE}}', base)
    target = root / out
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html, encoding='utf-8')
    print('built', out, f'({len(html):,} bytes)')

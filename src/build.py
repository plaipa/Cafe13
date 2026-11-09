#!/usr/bin/env python3
"""Builds the two static pages from src/*.template.html.

    python3 src/build.py

  index.html        the cafe's page (story, map, address, hours)
  menu/index.html   the menu page (the table QR code points here)

Placeholders: {{BASE}} path back to the site root, {{GLYPH}} the "13" outline
from assets/brand/logo-mark.svg, {{MAP}} the map from src/partials/map.html,
{{JSONLD}} the business data for search engines, made from data/menu.json.
  404.html          shown by GitHub Pages for any address that does not exist
"""
import hashlib
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
glyph = re.search(r' d="([^"]+)"', (root / 'assets/brand/logo-mark.svg').read_text(encoding='utf-8')).group(1)
map_html = (root / 'src/partials/map.html').read_text(encoding='utf-8').rstrip('\n')

settings = json.loads((root / 'data/menu.json').read_text(encoding='utf-8'))['settings']
SITE = 'https://caffe13.ir/'


def business_json():
    """schema.org data so Google can show the cafe's address, hours and phone. Nothing is invented: every value comes
    from data/menu.json (the admin panel keeps the phone, address and name in sync at runtime; hours are set here)."""
    fa = lambda k: (settings.get(k) or {}).get('fa', '')
    phone = re.sub(r'\D', '', settings.get('phone') or '')
    data = {
        '@context': 'https://schema.org', '@type': 'CafeOrCoffeeShop', '@id': SITE + '#cafe',
        'name': fa('name'), 'alternateName': (settings.get('name') or {}).get('en', ''),
        'url': SITE, 'image': SITE + 'assets/brand/logo-1024.png', 'logo': SITE + 'assets/brand/logo-1024.png',
        'description': 'قهوه و نوشیدنی، برگر و صبحانه در تبریز', 'servesCuisine': ['Coffee', 'Burgers', 'Breakfast'],
        'hasMenu': SITE + 'menu/',
        'address': {'@type': 'PostalAddress', 'streetAddress': fa('address'), 'addressLocality': fa('city'),
                    'addressRegion': 'آذربایجان شرقی', 'addressCountry': 'IR'},
        'openingHoursSpecification': [{'@type': 'OpeningHoursSpecification', 'opens': '09:00', 'closes': '00:00',
                                       'dayOfWeek': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']}],
    }
    if re.fullmatch(r'0\d{10}', phone): data['telephone'] = '+98' + phone[1:]
    if settings.get('instagram'): data['sameAs'] = ['https://www.instagram.com/' + settings['instagram'].lstrip('@')]
    if str(settings.get('mapUrl') or '').startswith('https://'): data['hasMap'] = settings['mapUrl']
    return json.dumps(data, ensure_ascii=False, indent=2).replace('</', '<\\/')


pages = [
    ('src/index.template.html', 'index.html', ''),
    ('src/menu.template.html', 'menu/index.html', '../'),
    ('src/404.template.html', '404.html', '/'),      # served at any depth, so its links start at the site root
]
def versioned(m):
    """Adds ?v=<content hash> to a local style or script, so phones never mix
    a new page with an old cached stylesheet or script after an update."""
    attr, path = m.group(1), m.group(2)
    digest = hashlib.sha1((root / path).read_bytes()).hexdigest()[:8]
    return f'{attr}="{{{{BASE}}}}{path}?v={digest}"'


for src, out, base in pages:
    html = (root / src).read_text(encoding='utf-8')
    html = re.sub(r'(href|src)="\{\{BASE\}\}((?:css|js|assets/vendor)/[^"?]+\.(?:css|js))"', versioned, html)
    html = html.replace('{{MAP}}', map_html).replace('{{GLYPH}}', glyph).replace('{{JSONLD}}', business_json()).replace('{{BASE}}', base)
    target = root / out
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html, encoding='utf-8')
    print('built', out, f'({len(html):,} bytes)')

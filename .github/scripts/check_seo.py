#!/usr/bin/env python3
"""Validate built sitemap, canonical URLs, social cards and identity JSON-LD."""
import json
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote

ROOT = Path("_site")
ORIGIN = "https://bahagogabriel.com"
PUBLIC = [ROOT / x for x in ("index.html", "about.html", "resume.html", "portfolio.html")]
PUBLIC += sorted((ROOT / "projects").glob("*.html"))
assert len(PUBLIC) >= 12, f"Missing original site pages: {len(PUBLIC)}"

robots = (ROOT / "robots.txt").read_text()
assert "User-agent: *" in robots and "Allow: /" in robots
assert f"Sitemap: {ORIGIN}/sitemap.xml" in robots
assert "Disallow: /" not in robots

sitemap = ET.fromstring((ROOT / "sitemap.xml").read_text().lstrip())
ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
assert sitemap.tag == ns + "urlset"
locs = [node.text for node in sitemap.iter(ns + "loc")]
expected = {ORIGIN + ("/" if p.name == "index.html" else "/" + p.relative_to(ROOT).as_posix()) for p in PUBLIC}
assert len(locs) == len(set(locs)) == len(expected), (locs, expected)
assert set(locs) == expected, f"Sitemap mismatch: missing {expected-set(locs)}, extra {set(locs)-expected}"
assert all(u.startswith(ORIGIN+"/") for u in locs)

class SEOPage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta = []
        self.links = []
        self.jsonld = []
        self._inside_jsonld = False
        self._chunks = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta":
            self.meta.append(attrs)
        elif tag == "link":
            self.links.append(attrs)
        elif tag == "script" and attrs.get("type") == "application/ld+json":
            self._inside_jsonld = True
            self._chunks = []
    def handle_data(self, data):
        if self._inside_jsonld:
            self._chunks.append(data)
    def handle_endtag(self, tag):
        if tag == "script" and self._inside_jsonld:
            self.jsonld.append(json.loads("".join(self._chunks)))
            self._inside_jsonld = False
            self._chunks = []
    def one_meta(self, key, value):
        matches = [x["content"] for x in self.meta if x.get(key) == value]
        assert len(matches) == 1, (key, value, matches)
        return matches[0]

def all_graph_items(page):
    out=[]
    for doc in page.jsonld:
        assert doc.get("@context") == "https://schema.org"
        out.extend(doc.get("@graph", [doc]))
    return out

for path in PUBLIC:
    doc = SEOPage()
    doc.feed(path.read_text())
    canonical = ORIGIN + ("/" if path.name == "index.html" else "/" + path.relative_to(ROOT).as_posix())
    links = [x.get("href") for x in doc.links if x.get("rel") == "canonical"]
    assert links == [canonical], (path, links, canonical)
    assert doc.one_meta("property", "og:url") == canonical
    assert doc.one_meta("property", "og:site_name") == "Samuel Bahago Gabriel"
    assert doc.one_meta("property", "og:title").strip()
    assert len(doc.one_meta("property", "og:description")) >= 45
    assert doc.one_meta("name", "twitter:title").strip()
    assert doc.one_meta("name", "twitter:description").strip()
    assert doc.one_meta("name", "twitter:card") in ("summary", "summary_large_image")
    img = doc.one_meta("property", "og:image")
    assert img == doc.one_meta("name", "twitter:image")
    assert img.startswith(ORIGIN + "/assets/"), (path, img)
    assert not img.lower().endswith(".svg"), f"Social image may not be widely supported: {img}"
    asset = ROOT / unquote(urlsplit(img).path).lstrip("/")
    assert asset.is_file(), f"Missing OG image {img}"
    nodes = all_graph_items(doc)
    if path.name == "index.html":
        assert {"WebSite", "Person"}.issubset({x["@type"] for x in nodes})
    if path.name == "about.html":
        assert {"ProfilePage", "Person"}.issubset({x["@type"] for x in nodes})
    if path.parent.name == "projects":
        assert len(nodes) == 1 and nodes[0]["@type"] == "CreativeWork"
        assert nodes[0]["url"] == canonical
        assert nodes[0]["creator"]["@id"] == ORIGIN + "/about.html#person"
    for obj in nodes:
        if obj["@type"] == "Person":
            assert obj["name"] == "Samuel Bahago Gabriel"
            assert obj["jobTitle"] == "Geospatial Analyst"
            assert obj["url"] == ORIGIN + "/about.html"
            assert "https://github.com/bahagogabriel" in obj["sameAs"]
            assert "https://www.linkedin.com/in/bahagogabriel" in obj["sameAs"]
print(f"SEO QA PASS: robots, dynamic {len(locs)}-URL sitemap, {len(PUBLIC)} canonicals, social cards, and identity JSON-LD.")

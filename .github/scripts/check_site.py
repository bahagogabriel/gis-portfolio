#!/usr/bin/env python3
"""Validate built Jekyll portfolio content, local assets and core user journeys."""
import json
import subprocess
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

subprocess.run(["ruby", ".github/scripts/check_cms_types.rb"], check=True)

ROOT = Path("_site")
PROJECTS = sorted((ROOT / "projects").glob("*.html"))
assert ROOT.joinpath("index.html").is_file(), "Missing homepage"
SOURCE_PROJECTS = sorted(Path("_projects").glob("*.md"))
assert len(SOURCE_PROJECTS) >= 8, "Expected the original eight accepted projects"
assert len(PROJECTS) == len(SOURCE_PROJECTS), (
    f"Expected {len(SOURCE_PROJECTS)} generated project pages, found {len(PROJECTS)}"
)
assert ROOT.joinpath("CNAME").read_text().strip() == "bahagogabriel.com"
assert ROOT.joinpath("downloads/Samuel_Bahago_Gabriel_CV.pdf").is_file()
assert ROOT.joinpath("styles.css").is_file()
assert ROOT.joinpath("app.js").is_file()
assert ROOT.joinpath("project.css").is_file()
assert ROOT.joinpath("project.js").is_file()
site = json.loads(Path("_data/site_content.json").read_text())
assert site["public_name"] == "Samuel Bahago Gabriel"
assert site["theme"] in {"green", "teal", "blue"}
assert site["cv_file"].startswith("/downloads/") and site["cv_file"].endswith(".pdf")
data = {name: json.loads(Path(f"_data/{name}.json").read_text()) for name in ["home","about","resume","portfolio"]}
assert len(data["home"]["featured"]["cards"]) >= 1
assert len(data["about"]["values"]["items"]) >= 1
assert len(data["resume"]["experience"]["positions"]) >= 1
checks=0
class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links=[]
        self.ids=set()
        self.text=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if a.get("id"):
            self.ids.add(a["id"])
        for attr in (("href",) if tag in ("a","link") else ("src",) if tag in ("script","img") else ()):
            if a.get(attr):
                self.links.append((tag,a[attr]))
    def handle_data(self, data):
        self.text.append(data)
all_pages=[ROOT / f"{p}.html" for p in ("index","about","resume","portfolio")]+PROJECTS
for page in all_pages:
    raw=page.read_text()
    assert "{{" not in raw and "{%" not in raw, f"Unrendered template code: {page}"
    assert "about:invalid" not in raw, f"Invalid URL in {page}"
    parser=Page()
    parser.feed(raw)
    assert "Samuel Bahago Gabriel" in " ".join(parser.text), f"Public identity missing: {page}"
    assert parser.links, f"No links in {page}"
    for tag,url in parser.links:
        u=urlparse(url)
        if u.scheme in ("http","https","mailto","tel","data") or url.startswith("//"):
            continue
        assert not u.scheme, f"Unsupported URL scheme: {page} {url}"
        if not u.path and u.fragment:
            assert u.fragment in parser.ids, f"Invalid in-page anchor: {page} {url}"
            continue
        if not u.path:
            continue
        path=unquote(u.path)
        resolved=(ROOT / path.lstrip("/")) if path.startswith("/") else (page.parent / path)
        if path.endswith("/"):
            resolved/= "index.html"
        assert resolved.is_file(), f"Missing internal target: {page} -> {url}"
        checks+=1
home=(ROOT/"index.html").read_text()
assert "home-feature-grid" in home and "research-spotlight" in home
assert "mailto:"+site["email"] in home
assert "tel:"+site["telephone"] in home
assert site["cv_file"] in home
assert "phone_display" not in home, "Template variable leaked"
resume=(ROOT/"resume.html").read_text()
assert site["cv_file"] in resume
print(f"Site validation passed: {len(all_pages)} pages, {len(PROJECTS)} projects, {checks} internal links/assets, PDF, CNAME and CMS source data.")

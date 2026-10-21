#!/usr/bin/env python3
"""Independent PDF acceptance for actual mapped-data comparison (Chromium-generated).
Checks real downloadable PDF layout, provenance text, and absence of private field notes.
No scientific ground truth is inferred from a visual/PDF inspection.
"""
from pathlib import Path
import fitz

pdf_file=Path("petroscreen-ng/artifacts_nine_state/Stage18_TwoSites.pdf")
assert pdf_file.is_file(), pdf_file
doc=fitz.open(pdf_file)
assert 2<=len(doc)<=8, ("Expected multi-page comparison",len(doc))
text="\n".join(p.get_text() for p in doc)
for phrase in [
    "PETROSCREEN NG", "SITE A", "SITE B", "Delta", "Rivers",
    "ESA WorldCover 2021", "JRC GSW", "1984-2024",
    "Mapped", "2021", "SOURCE", "WGS84",
    "RESEARCH PREVIEW", "NOT A RISK RANK"
]:
    assert phrase in text, ("Missing PDF text", phrase)
for private in ["Test Corridor", "Needs tidal check", "Field Team",
                "SENSITIVE OBSERVER", "Secret Corridor"]:
    assert private not in text, ("Sensitive user field unexpectedly included", private)
for page_num,page in enumerate(doc,1):
    rect=page.rect
    assert rect.width>rect.height and abs(rect.width-842)<5
    assert len(page.get_text("words"))>=12,("Empty PDF page",page_num)
    for word in page.get_text("words"):
        box=fitz.Rect(word[:4])
        assert box.x0>=-1 and box.y0>=-1 and box.x1<=rect.width+1 and box.y1<=rect.height+1,(
            "Text clipped outside PDF page",page_num,word)
    print("PAGE",page_num,"words",len(page.get_text("words")))
print("STAGE18_REAL_COMPARISON_PDF_SOURCE_AND_LAYOUT_PASS")

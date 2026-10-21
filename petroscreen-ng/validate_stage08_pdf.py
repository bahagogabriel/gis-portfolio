"""Stage 08 PDF audit of actual browser downloads, including regional headers."""
from pathlib import Path
import fitz
ROOT=Path("petroscreen-ng/artifacts_nine_state")
for name in ("Delta","Rivers"):
    p=ROOT/f"{name}_review.pdf"
    assert p.is_file(),f"Missing actual browser PDF: {p}"
    d=fitz.open(p)
    expected_pages=4 if name=="Delta" else 3
    assert len(d)==expected_pages, f"{name}: expected {expected_pages} pages, found {len(d)}"
    first=d[0].get_text()
    complete="\n".join(page.get_text() for page in d)
    assert "NIGER DELTA | RESEARCH PREVIEW" in first, f"{name}: truncated header"
    assert f"{name} State, Nigeria" in first, f"{name}: missing state attribution"
    for token in ("1984-2024","Source: EC JRC/Google","GRID3",
                  "Not a regulatory EIA","WorldCover 2021"):
        assert token.casefold() in complete.casefold(),f"{name}: missing {token}"
    last=d[2].get_text()
    for token in ("SITE RECONNAISSANCE", "nearest mapped class", "field verification",
                  "Mapped permanent water","Mapped herbaceous wetland","Mapped mangroves",
                  "Mapped built-up","Not mapped"):
        if token == "Not mapped" and token not in last:continue
        assert token.casefold() in last.casefold(),f"{name}: missing context {token}"
    if name=="Delta":
        fourth=d[3].get_text()
        for text in ("PETROLEUM | EVIDENCE SCOPING","Pipeline / flowline",
                     "Crossing and alignment survey","NUPRC",
                     "USER-DECLARED"):
            assert text.casefold() in fourth.casefold(),f"Delta: missing scope page text {text}"
        assert "NOT" in fourth or "not" in fourth
    images=d[0].get_images(full=True)
    assert images,f"{name}: missing geospatial map"
    for i,page in enumerate(d,1):
        for block in page.get_text("dict")["blocks"]:
            if block.get("type")!=0:continue
            for line in block["lines"]:
                for span in line["spans"]:
                    x0,_,x1,_=span["bbox"]
                    assert x0>=24 and x1<=page.rect.width-14,(
                        f"{name} page {i}: clipped text {span['text']!r}")
    # Explicitly avoid collision of right-aligned tag with PETROSCREEN NG brand.
    spans=[z for b in d[0].get_text("dict")["blocks"] if b.get("type")==0
           for l in b["lines"] for z in l["spans"]]
    badge=next(z for z in spans if "NIGER DELTA | RESEARCH PREVIEW" in z["text"])
    assert badge["bbox"][0]>d[0].rect.width*.45, f"{name}: title overlaps logo"
    print(f"{name}: PASS pages={expected_pages} state-label=PASS header=PASS map=PASS source-credits=PASS")
print("STAGE08_PDF_ACCEPTANCE=PASS")

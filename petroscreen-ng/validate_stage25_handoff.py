#!/usr/bin/env python3
"""Stage25: independent actual browser-generated desk-review PDF validation.

Only test-demo sites are used. The source raster bytes and original mapped
screening PDF are authoritative; addenda cannot rewrite measured conclusions.
"""
from pathlib import Path
import json
import fitz

root=Path("petroscreen-ng/artifacts_nine_state")
for state,original_pages in [("Delta",4),("Rivers",3)]:
    raw=root/f"{state}_review.pdf"
    handoff=root/f"{state}_professional_handoff.pdf"
    case=root/f"{state}_case.json"
    assert raw.exists() and handoff.exists() and case.exists(),state
    casefile=json.loads(case.read_text())
    with fitz.open(raw) as base,fitz.open(handoff) as document:
        assert len(base)==original_pages,(state,"base-page-count",len(base))
        assert len(document)>=original_pages+2,(state,"handoff-page-count",len(document))
        assert len(document)<=original_pages+8,(state,"runaway-pagination",len(document))
        for i in range(original_pages):
            # Baseline page content is literally unchanged - not regenerated
            # from reconstructed figures or recomputed/synthetic measurements.
            assert document[i].get_text()==base[i].get_text(),(state,"original page text changed",i+1)
            assert len(document[i].get_images(full=True))==len(base[i].get_images(full=True)),(
                state,"original page images changed",i+1)
        additional="\n".join(document[i].get_text() for i in range(original_pages,len(document)))
        all_text="\n".join(p.get_text() for p in document)
        for expected in (
            "PROFESSIONAL DESK-REVIEW HANDOFF",
            "Desk-review handoff",
            "Verified pilot state",
            state,
            "1984-2024",
            "WorldCover",
            "Field observations awaiting independent review",
            "Source",
            "Qualified review",
            "SHA256:",
            "risk",
        ):
            assert expected.lower() in additional.lower(),(state,"missing section",expected)
        for invalid in ("Field Team","Needs tidal check",
                        "DO_NOT_PUBLISH_OBSERVER","DO_NOT_PUBLISH_PRIVATE_NOTES"):
            assert invalid not in additional,(state,"private notes leaked",invalid)
        for original in casefile["source_provenance"]["source_file_sha256"]:
            assert original["name"] in additional,(state,"missing source file",original["name"])
            digest=original["sha256"]
            assert digest[:32] in additional and digest[32:] in additional,(
                state,"missing source digest",original["name"])
        assert "Not a regulatory EIA" in all_text
        assert "risk" in additional.lower()
        assert "2021" in additional
        if state=="Delta":
            assert "Crossing and alignment survey" in additional
            assert "user reported unverified field observed" in additional.lower(),(
                state,"field reported status not distinguished")
        else:
            assert "not checked" in additional.lower()
        for j in range(original_pages,len(document)):
            page=document[j]
            assert abs(page.rect.width-fitz.paper_rect("a4").width)<1.0,(
                state,"A4 width",page.rect.width)
            assert abs(page.rect.height-fitz.paper_rect("a4").height)<1.0,(
                state,"A4 height",page.rect.height)
            spans=[]
            for block in page.get_text("dict")["blocks"]:
                if block.get("type")!=0:continue
                for line in block["lines"]:
                    spans.extend(line["spans"])
            assert spans,(state,j,"empty appendix page")
            for span in spans:
                x0,y0,x1,y1=span["bbox"]
                assert x0>=45 and x1<=page.rect.width-42,(
                    state,j+1,"side-clipped",span["text"],x0,x1)
                assert y0>=17 and y1<=page.rect.height-12,(
                    state,j+1,"vertically clipped",span["text"],y0,y1)
        print(f"STAGE25_{state.upper()}_PROFESSIONAL_HANDOFF=PASS "
              f"base={original_pages} total={len(document)} "
              f"source_files={len(casefile['source_provenance']['source_file_sha256'])}")
print("STAGE25_SOURCE_ATTRIBUTED_PRINTABLE_HANDOFF=PASS")

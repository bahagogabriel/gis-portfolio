"""Stage 04 PDF acceptance: mapped figure, readable methodology and source dates."""
from pathlib import Path
import fitz

REPORT=Path("petroscreen-ng/artifacts_web/petroscreen_sample_report.pdf")

def main():
    if not REPORT.is_file():
        raise SystemExit("Missing desktop-browser-generated PDF")
    doc=fitz.open(REPORT)
    if len(doc)!=2:
        raise SystemExit(f"Expected exactly two report pages; got {len(doc)}")
    text="\n".join(page.get_text() for page in doc).casefold()
    required=("petroscreen ng","bayelsa","worldcover","global surface water",
              "regulatory eia","1984-2024","study buffer")
    missing=[t for t in required if t not in text]
    if missing:
        raise SystemExit(f"Report does not include mandatory fields: {missing}")
    imgs=doc[0].get_images(full=True)
    if not imgs:
        raise SystemExit("The first page is missing the site map image")
    first=doc[0].get_image_info(xrefs=True)
    if not any(item["width"]>=400 and item["height"]>=300 for item in first):
        raise SystemExit("The page has no suitably sized rendered site map")
    print({"status":"PASS","pages":len(doc),
           "map_image_count":len(imgs),"bytes":REPORT.stat().st_size,
           "source_text_check":"PASS"})
if __name__=="__main__":
    main()

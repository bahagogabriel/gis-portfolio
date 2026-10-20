"""Stage 04 PDF acceptance: mapped figure, readable methodology and source dates."""
from pathlib import Path
import io
import fitz
from PIL import Image

REPORTS=[Path("petroscreen-ng/artifacts_web")/name for name in (
    "petroscreen_sample_report.pdf",
    "petroscreen_sample_report_3km.pdf",
    "petroscreen_sample_report_5km.pdf",
)]

def verify(REPORT):
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
    # A blank white WebGL screenshot can pass an image-count test; verify actual pixel variety.
    xref=imgs[0][0]
    raw=doc.extract_image(xref)["image"]
    im=Image.open(io.BytesIO(raw)).convert("RGB").resize((90,50))
    unique_colors=len(set(im.getdata()))
    if unique_colors<30:
        raise SystemExit(f"Map illustration looks blank/monochrome: {unique_colors} colors")
    # Critical labels must not extend beyond A4 physical margins.
    for page_number,page in enumerate(doc,1):
        for line in page.get_text("dict")["blocks"]:
            if line.get("type")!=0:continue
            for sub in line["lines"]:
                for span in sub["spans"]:
                    x0,y0,x1,y1=span["bbox"]
                    if x0 < 24 or x1 > page.rect.width-14:
                        raise SystemExit(
                          f"Text escapes safe page width on page {page_number}: {span['text']!r} at {span['bbox']}")
    print({"status":"PASS","report":REPORT.name,"pages":len(doc),"map_unique_colors":unique_colors,
           "map_image_count":len(imgs),"bytes":REPORT.stat().st_size,
           "source_text_check":"PASS"})
def main():
    for report in REPORTS:
        verify(report)
    print({"status":"PASS","mapped_a4_reports_verified":len(REPORTS)})
if __name__=="__main__":
    main()

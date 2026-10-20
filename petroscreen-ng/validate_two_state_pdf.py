"""Confirm dual-state browser PDF contains real map and correct region, sources."""
from pathlib import Path
import io
import fitz
from PIL import Image

ROOT=Path("petroscreen-ng/artifacts_two_state_web")
EXPECTED=[
 "two_state_Rivers_interior_3km.pdf",
 "two_state_Bayelsa_interstate_5km.pdf",
 "two_state_Rivers_interstate_1km.pdf"
]
def verify(file):
    p=ROOT/file
    if not p.is_file():raise AssertionError(f"Missing browser report: {p}")
    pdf=fitz.open(p)
    if len(pdf)!=2:raise AssertionError(f"Expected two A4 pages for {file}")
    alltext="\n".join(page.get_text() for page in pdf).casefold()
    for snippet in ("petroscreen ng","bayelsa and rivers","worldcover","source: ec jrc/google",
                    "grid3","1984-2024","not a regulatory eia"):
        if snippet not in alltext:
            raise AssertionError(f"Missing mandatory provenance/limitation in {file}: {snippet}")
    images=pdf[0].get_images(full=True)
    if not images:raise AssertionError("Mapped report has no images")
    raw=pdf.extract_image(images[0][0])["image"]
    im=Image.open(io.BytesIO(raw)).convert("RGB").resize((90,50))
    if len(set(im.getdata()))<30:raise AssertionError("Mapped image blank/monotone")
    for page in pdf:
        for block in page.get_text("dict")["blocks"]:
            if block.get("type")!=0:continue
            for line in block["lines"]:
                for span in line["spans"]:
                    x0,y0,x1,y1=span["bbox"]
                    if x0<23 or x1>page.rect.width-13:
                        raise AssertionError("Report text extends beyond right/left margin")
    return {"file":file,"pages":len(pdf),"map_colors":len(set(im.getdata()))}

if __name__=="__main__":
    import json
    print(json.dumps({"status":"PASS","reports":[verify(name) for name in EXPECTED]},indent=2))

"""Regression gate for nine-state on-demand browser-generated PDF research reports."""
from pathlib import Path
import io
import fitz
from PIL import Image
ROOT=Path("petroscreen-ng/artifacts_nine_state_web")
EXPECTED=[ROOT/f"nine_state_{i}.pdf" for i in (1,2,3)]
def main():
 for path in EXPECTED:
  if not path.exists():raise RuntimeError("Missing PDF "+str(path))
  doc=fitz.open(path)
  if len(doc)!=2:raise RuntimeError("Expected two-page A4 "+str(path))
  text=" ".join(page.get_text() for page in doc).casefold()
  for phrase in ("petroscreen ng","niger delta nine-state pilot","worldcover",
    "jrc global surface water","grid3","ec jrc/google","1984-2024"):
   if phrase not in text:raise RuntimeError(f"Missing provider attribution {phrase} in {path}")
  imgs=doc[0].get_images(full=True)
  if not imgs:raise RuntimeError("Missing site map: "+str(path))
  raw=doc.extract_image(imgs[0][0])["image"]
  im=Image.open(io.BytesIO(raw)).convert("RGB").resize((90,50))
  if len(set(im.getdata()))<30:raise RuntimeError("Blank map image in "+str(path))
  for page in doc:
   for block in page.get_text("dict")["blocks"]:
    if block.get("type")!=0:continue
    for line in block["lines"]:
     for span in line["spans"]:
      if span["bbox"][0]<22 or span["bbox"][2]>page.rect.width-12:
       raise RuntimeError("PDF text exceeds safe page boundary: "+span["text"])
 print({"status":"PASS","nine_state_source_attributed_mapped_pdfs":len(EXPECTED)})
if __name__=="__main__":main()

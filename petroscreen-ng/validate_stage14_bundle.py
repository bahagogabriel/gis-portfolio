#!/usr/bin/env python3
"""Independent Stage14 ZIP + embedded PDF inspection using stdlib zipfile and PyMuPDF.

Inputs are CI-generated TEST screening locations and simulated user notes only.
This does not authenticate field observations or validate satellite map accuracy.
"""
import hashlib
import json
import pathlib
import zipfile

import fitz

BASE=pathlib.Path("petroscreen-ng/artifacts_nine_state")
DATA=pathlib.Path("petroscreen-ng/web/public/data")
source=json.loads((DATA/"manifest.json").read_text())
assert len(source["state_sources"])==9
BASE_FILES={
    "README.txt","ScreeningCase.json","ScreeningData.csv","FieldChecklist.csv",
    "EvidenceRegister.csv","Site_Buffer.geojson","Preliminary_Screening.pdf",
}
def validate(state,petroleum):
    path=BASE/f"{state}_case_bundle.zip"
    assert path.is_file(),path
    with zipfile.ZipFile(path) as z:
        names=z.namelist()
        assert len(names)==len(set(names)),(state,"duplicate ZIP entries")
        assert len(names)==(9 if petroleum else 8),names
        assert all("/" not in n and "\\" not in n and ".." not in n for n in names),names
        assert set(names)==BASE_FILES|{"MANIFEST.json"}|(
            {"PetroleumEvidencePlan.csv"} if petroleum else set()),names
        assert all(z.getinfo(name).compress_type==zipfile.ZIP_STORED for name in names)
        assert z.testzip() is None,(state,"CRC failed")
        files={name:z.read(name) for name in names}
    manifest=json.loads(files["MANIFEST.json"])
    case=json.loads(files["ScreeningCase.json"])
    geometry=json.loads(files["Site_Buffer.geojson"])
    assert manifest["schema"]=="PetroScreenNG/CaseBundle/1.0"
    assert manifest["package_version"]=="1.4"
    assert manifest["created_at_utc"]==case["created_at_utc"]
    assert case["site"]["state"]==state
    assert manifest["site"]==case["site"]
    assert manifest["pdf_pages"]==(4 if petroleum else 3),manifest["pdf_pages"]
    assert case["schema"]=="PetroScreenNG/ScreeningCase/1.0"
    assert case["evidence_review"]["review"]["no_field_authentication"] is True
    assert len(case["measurements"]["mapped_landscape_proximity_2021"]["indicators"])==4
    assert case["petroleum_scope"]["mapped_asset_locations_used"] is False
    assert len(case["field_verification"]["checklist"])==7
    refs=next(row for row in source["state_sources"] if row["state"]==state)["source_files"]
    assert manifest["source_file_sha256"]==case["source_provenance"]["source_file_sha256"]
    assert {(v["name"],v["sha256"],v["kind"]) for v in manifest["source_file_sha256"]}=={
        (v["file"],v["sha256"],v["kind"]) for v in refs}
    assert len(manifest["files"])==len(BASE_FILES)+(1 if petroleum else 0)
    assert {e["name"] for e in manifest["files"]}==set(files)-{"MANIFEST.json"}
    for e in manifest["files"]:
        actual=files[e["name"]]
        assert e["bytes"]==len(actual),e["name"]
        assert e["sha256"]==hashlib.sha256(actual).hexdigest(),e["name"]
        assert len(e["sha256"])==64
    readme=files["README.txt"].decode()
    assert "not an onsite survey" in readme
    assert "not who created a record" in readme
    assert "Exact coordinates" in readme
    point,ring=geometry["features"]
    assert point["geometry"]["type"]=="Point"
    assert ring["geometry"]["type"]=="Polygon"
    assert point["geometry"]["coordinates"]==[
        case["site"]["longitude"],case["site"]["latitude"]]
    assert len(ring["geometry"]["coordinates"][0])>=16
    doc=fitz.open(stream=files["Preliminary_Screening.pdf"],filetype="pdf")
    assert len(doc)==manifest["pdf_pages"],(state,len(doc))
    words=" ".join(page.get_text() for page in doc)
    assert "PETROSCREEN NG" in words
    assert "2021" in words and "1984" in words
    if petroleum:
        assert case["petroleum_scope"]["facility_type"]=="pipeline"
        assert "PetroleumEvidencePlan.csv" in files
        assert "pipe_crossings" in files["PetroleumEvidencePlan.csv"].decode()
        assert any(i["status"]=="field_observed" for i in case["field_verification"]["checklist"])
        assert "PETROLEUM" in words
    else:
        assert case["petroleum_scope"]["facility_type"]=="not_specified"
        assert "PetroleumEvidencePlan.csv" not in files
        assert all(i["status"]=="not_checked" for i in case["field_verification"]["checklist"])
    print(f"STAGE14_{state.upper()}_PACKAGE_PASS: {len(names)} files, "
          f"SHA256 verified={len(manifest['files'])}, PDF pages={len(doc)}")
validate("Delta",True)
validate("Rivers",False)
print("STAGE14_REAL_BROWSER_ZIP_AND_PDF_ACCEPTANCE=PASS")

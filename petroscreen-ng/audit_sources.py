"""Conservative public-source landing page check. NOT scientific dataset QA."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

MANIFEST = Path(__file__).with_name("source_register.json")

def audit_one(url, timeout=15):
    request = Request(url, headers={"User-Agent": "PetroScreen-NG-Source-Discovery/0.1", "Accept": "application/json,text/html"})
    try:
        with urlopen(request, timeout=timeout) as response:
            sample = response.read(2048)
            status = getattr(response, "status", 200)
            return {"status": "reachable" if status == 200 and bool(sample) else "needs_review",
                    "http_status": status, "sample_bytes": len(sample)}
    except HTTPError as error:
        return {"status": "unverified", "http_status": error.code, "error": str(error)}
    except (URLError, TimeoutError, OSError) as error:
        return {"status": "unverified", "error": str(error)}

def audit(manifest, run=audit_one):
    entries = []
    for required, key in ((True, "required"), (False, "optional")):
        for item in manifest[key]:
            entries.append({"id": item["id"], "required": required, "url": item["url"], **run(item["url"])})
    return {"checked_at_utc": datetime.now(timezone.utc).isoformat(),
            "scope": "Landing pages only; no actual imagery acquired or validated", "entries": entries}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="petroscreen-ng/source_probe_results.json")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    result = audit(manifest)
    Path(args.output).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    for row in result["entries"]:
        print(row["id"], "CORE" if row["required"] else "OPTIONAL", row["status"])
    if any(row["required"] and row["status"] != "reachable" for row in result["entries"]):
        print("CAUTION: some required source endpoints could not be verified on this runner; G0 remains PENDING")

if __name__ == "__main__":
    main()

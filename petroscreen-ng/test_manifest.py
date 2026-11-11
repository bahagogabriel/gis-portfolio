import json
import unittest
from pathlib import Path
from audit_sources import audit

MANIFEST = json.loads(Path(__file__).with_name("source_register.json").read_text(encoding="utf-8"))

class AuditContractTests(unittest.TestCase):
    def test_required_sources_are_public_and_have_fallbacks(self):
        self.assertEqual(len(MANIFEST["required"]), 3)
        for item in MANIFEST["required"]:
            self.assertTrue(item["url"].startswith("https://"))
            self.assertTrue(item["fallback"])
            self.assertTrue(item["data_gate"])
    def test_optional_missing_does_not_block_core(self):
        simulated = audit(MANIFEST, run=lambda url: {"status": "unverified"})
        self.assertEqual(len(simulated["entries"]), 7)
        self.assertTrue(all(row["status"] == "unverified" for row in simulated["entries"]))
    def test_no_mandatory_local_agency(self):
        self.assertTrue(MANIFEST["no_mandatory_nigerian_agency_data"])
        self.assertFalse(MANIFEST["deployment_allowed"])

if __name__ == "__main__":
    unittest.main()

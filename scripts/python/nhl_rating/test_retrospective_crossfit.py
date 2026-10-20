"""Boundary checks using synthetic fixtures only; no season model fitting."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("crossfit", Path(__file__).with_name("retrospective-crossfit.py"))
crossfit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crossfit)


class SourceOnlyBoundaryTests(unittest.TestCase):
    def test_fixed_native_fixture_matches_all_three_ridges(self):
        parity, names = crossfit.native_glm_fixture_parity()
        self.assertEqual(parity["rows"], 192)
        self.assertEqual([row["ridge"] for row in parity["comparisons"]], [1, 10, 100])
        self.assertEqual(len(names), 21)
        self.assertTrue(all(row["maxPredictionError"] < 1e-12 for row in parity["comparisons"]))

    def test_draft_policy_stops_before_reading_season_rows(self):
        with tempfile.TemporaryDirectory(prefix="nhl-crossfit-boundary-") as temporary:
            directory = Path(temporary)
            policy = directory/"draft.md"
            policy.write_text("Status: **DRAFT**\n", encoding="utf-8")
            arguments = ["trainer", "--source-only", "--rows", str(directory/"nonexistent.json"),
                         "--output", str(directory/"output"), "--policy", str(policy)]
            with patch.object(sys, "argv", arguments), self.assertRaisesRegex(ValueError, "SEALED"):
                crossfit.main()
            self.assertFalse((directory/"output").exists())

    def test_exact_policy_and_manifest_saved_before_any_season_fit(self):
        with tempfile.TemporaryDirectory(prefix="nhl-crossfit-boundary-") as temporary:
            directory = Path(temporary)
            policy = directory/"synthetic-sealed-policy.md"
            policy_bytes = b"Status: **SEALED**\r\nSynthetic boundary-test policy only.\r\n"
            policy.write_bytes(policy_bytes)
            rows = [dict(gameId=2024020000+i, eventId=1, date=f"2024-10-{i+1:02d}",
                         goal=i % 2, features=[1]+[0]*15) for i in range(30)]
            rows_hash = hashlib.sha256(json.dumps(rows, separators=(",", ":")).encode()).hexdigest()
            source = dict(season=20242025, gameType=2, rows=rows, rowsSha256=rows_hash,
                          effectiveGameSourceHashes=[dict(gameId=row["gameId"]) for row in rows])
            source_path, output = directory/"synthetic.json", directory/"output"
            source_path.write_text(json.dumps(source), encoding="utf-8")
            arguments = ["trainer", "--source-only", "--rows", str(source_path),
                         "--output", str(output), "--policy", str(policy)]
            with patch.object(sys, "argv", arguments), \
                    patch.object(crossfit, "native_glm_fixture_parity", return_value=({}, [])), \
                    patch.object(crossfit, "fit_glm", side_effect=RuntimeError("stop before season fit")), \
                    self.assertRaisesRegex(RuntimeError, "stop before season fit"):
                crossfit.main()
            self.assertEqual((output/"frozen-policy.md").read_bytes(), policy_bytes)
            manifest = json.loads((output/"fold-manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["policySha256"], hashlib.sha256(policy_bytes).hexdigest())
            self.assertTrue((output/"startup-provenance.json").exists())
            self.assertFalse((output/"fold-fit-manifest.json").exists())


if __name__ == "__main__":
    unittest.main()

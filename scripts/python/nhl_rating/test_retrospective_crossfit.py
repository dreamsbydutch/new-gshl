"""Boundary checks using synthetic fixtures only; no season model fitting."""
import hashlib
import copy
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


class TrainingSupportTests(unittest.TestCase):
    def fixture(self):
        schedule = [dict(id=2009020001+i, gameDate=f"2009-10-{i+1:02d}", season=20092010, gameType=2, gameStateId=7) for i in range(2)]
        rows = [dict(gameId=2009020001,eventId=1,date="2009-10-01")]
        games = [dict(gameId=entry["id"],date=entry["gameDate"],sourceSha256="a"*64,effectivePbpSha256="b"*64,
                      trainingRows=1 if i==0 else 0,disposition="included" if i==0 else "zero-verified-ordinary-events") for i,entry in enumerate(schedule)]
        support = dict(version="nhl-shot-training-support-v1",games=games)
        hashes = [dict(gameId=entry["id"],sha256="a"*64) for entry in schedule]
        effective = [dict(gameId=entry["id"],sha256="b"*64,shots=1 if i==0 else 0) for i,entry in enumerate(schedule)]
        schedule_hash = hashlib.sha256(json.dumps(schedule,separators=(",", ":")).encode()).hexdigest()
        source = dict(season=20092010,gameType=2,rows=rows,effectiveGameSourceHashes=effective,trainingSupport=support,
                      completedSchedule=schedule,completedScheduleGames=2,scheduleSha256=schedule_hash)
        metadata = dict(season=20092010,gameType=2,trainingSupport=copy.deepcopy(support),gameSourceHashes=hashes,
                        officialGames=2,loadedGames=2,scheduleSha256=schedule_hash)
        audit = dict(season=20092010,trainingSupport=copy.deepcopy(support),gameSourceHashes=copy.deepcopy(hashes),
                     officialGames=2,loadedGames=2,failed=[],games=[dict(gameId=entry["id"],date=entry["gameDate"],eligible=i==0,
                     officialShots=7,verifiedShotCount=1 if i==0 else 0,gameSeconds=3600,usableProcessSeconds=3400) for i,entry in enumerate(schedule)])
        return source,metadata,audit

    def test_explicit_zero_row_game_keeps_calendar_and_exposure_without_estimator_label(self):
        source,metadata,audit=self.fixture();before=copy.deepcopy((source,metadata,audit))
        result=crossfit.validate_training_support(source,metadata,audit)
        self.assertEqual(result["officialGames"],2);self.assertEqual(result["estimationGames"],1)
        self.assertEqual(result["zeroTrainingGameIds"],[2009020002])
        self.assertEqual((source,metadata,audit),before)
        self.assertEqual(audit["games"][1]["usableProcessSeconds"],3400)
        self.assertEqual(len(source["rows"]),1)

    def test_legacy_nonempty_support_is_unchanged_but_unexplained_missing_game_rejects(self):
        source,_,_=self.fixture();del source["trainingSupport"]
        with self.assertRaisesRegex(ValueError,"explicit trainingSupport"):
            crossfit.validate_training_support(source)
        source["effectiveGameSourceHashes"]=source["effectiveGameSourceHashes"][:1]
        self.assertIsNone(crossfit.validate_training_support(source))

    def test_omitted_duplicate_wrong_hash_wrong_date_and_accidental_row_drop_reject(self):
        changes = [
            lambda s,m,a:s["completedSchedule"].pop(),
            lambda s,m,a:s["trainingSupport"]["games"].pop(),
            lambda s,m,a:s["effectiveGameSourceHashes"].append(s["effectiveGameSourceHashes"][0]),
            lambda s,m,a:m["gameSourceHashes"][0].update(sha256="c"*64),
            lambda s,m,a:s["effectiveGameSourceHashes"][0].update(sha256="c"*64),
            lambda s,m,a:a["games"][1].update(date="2009-10-03"),
            lambda s,m,a:s["rows"].clear(),
            lambda s,m,a:a["games"][1].update(eligible=True),
            lambda s,m,a:a["games"][1].update(verifiedShotCount=1),
            lambda s,m,a:s["trainingSupport"]["games"][1].update(disposition="included"),
            lambda s,m,a:s["trainingSupport"]["games"][0].update(trainingRows=True),
            lambda s,m,a:a["games"][1].update(officialShots=float("nan")),
            lambda s,m,a:a["games"][1].update(officialShots=7.5),
            lambda s,m,a:a["games"][0].update(verifiedShotCount=0.5),
            lambda s,m,a:a.update(loadedGames=1),
            lambda s,m,a:a.update(failed=[dict(gameId=2009020002)]),
        ]
        for change in changes:
            with self.subTest(change=change):
                source,metadata,audit=self.fixture();change(source,metadata,audit)
                with self.assertRaises(ValueError):crossfit.validate_training_support(source,metadata,audit)

    def test_missing_physical_authority_never_becomes_supported_zero(self):
        source,metadata,audit=self.fixture()
        for m,a in [(None,audit),(metadata,None)]:
            with self.assertRaisesRegex(ValueError,"metadata and physical audit"):
                crossfit.validate_training_support(source,m,a)


if __name__ == "__main__":
    unittest.main()

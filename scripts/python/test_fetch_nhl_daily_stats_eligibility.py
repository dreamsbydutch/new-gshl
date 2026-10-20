import unittest
import ssl
from types import SimpleNamespace

from fetch_nhl_daily_stats import fetch_daily_stats, ssl_verification


class DailyGameEligibilityTest(unittest.TestCase):
    def test_verified_transport_requires_certificates_and_hostname_checks(self):
        context = ssl_verification(True)
        self.assertIsInstance(context, ssl.SSLContext)
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(context.check_hostname)
        self.assertIs(ssl_verification(False), False)

    def client(self, games, boxscore_type=None):
        calls = []

        def boxscore(game_id):
            calls.append(int(game_id))
            return {
                "gameType": boxscore_type or int(game_id),
                "season": 20212022,
                "awayTeam": {"id": 14, "abbrev": "TBL", "score": 0},
                "homeTeam": {"id": 28, "abbrev": "SJS", "score": 0},
                "playerByGameStats": {},
            }

        client = SimpleNamespace(
            schedule=SimpleNamespace(daily_schedule=lambda **_: {"games": games}),
            game_center=SimpleNamespace(
                boxscore=boxscore, play_by_play=lambda _: {"plays": []}
            ),
        )
        return client, calls

    def test_exhibitions_and_preseason_never_reach_the_stat_import(self):
        client, calls = self.client(
            [{"id": kind, "gameType": kind} for kind in (1, 2, 3, 4)]
        )
        players, teams, rosters, count = fetch_daily_stats(client, "2022-02-05")
        self.assertEqual(calls, [2, 3])
        self.assertEqual(count, 2)
        self.assertEqual(len(teams), 4)
        self.assertEqual(players, [])
        self.assertEqual(rosters, [])

    def test_inconsistent_schedule_and_boxscore_eligibility_refuses_import(self):
        client, _ = self.client([{"id": 2, "gameType": 2}], boxscore_type=4)
        with self.assertRaisesRegex(RuntimeError, "refusing partial stats"):
            fetch_daily_stats(client, "2022-02-05")


if __name__ == "__main__":
    unittest.main()

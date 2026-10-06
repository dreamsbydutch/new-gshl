import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from fetch_nhl_daily_stats import collect_power_play_points, is_power_play_goal, fetch_daily_stats


class PowerPlayTests(unittest.TestCase):
    def test_failed_game_fetch_cannot_erase_existing_stats(self):
        for endpoint in ("boxscore", "play_by_play"):
            client = SimpleNamespace(
                schedule=SimpleNamespace(daily_schedule=Mock(return_value={"games": [{"id": 1}]})),
                game_center=SimpleNamespace(boxscore=Mock(return_value={}), play_by_play=Mock(return_value={})),
            )
            getattr(client.game_center, endpoint).side_effect = RuntimeError("unavailable")
            with self.assertRaisesRegex(RuntimeError, "refusing partial stats"):
                fetch_daily_stats(client, "2026-10-03")

    def test_demidov_extra_attacker_goal_and_assist_are_not_power_play_points(self):
        plays = {"plays": [
            {"typeDescKey": "goal", "situationCode": "0651",
             "details": {"eventOwnerTeamId": 8, "scoringPlayerId": 8484984}},
            {"typeDescKey": "goal", "situationCode": "0651",
             "details": {"eventOwnerTeamId": 8, "assist2PlayerId": 8484984}},
        ]}
        self.assertEqual(collect_power_play_points(plays, 8, 5).get(8484984, 0), 0)

    def test_penalty_advantage_with_and_without_goalies(self):
        for code, owner, expected in [
            ("1551", 8, False), ("1541", 8, True), ("1451", 5, True),
            ("0651", 8, False), ("1560", 5, False),
            ("0641", 8, True), ("1460", 5, True),
            ("1541", 5, False), ("1331", 8, False),
        ]:
            with self.subTest(code=code, owner=owner):
                self.assertEqual(is_power_play_goal({"typeDescKey": "goal",
                    "situationCode": code, "details": {"eventOwnerTeamId": owner}}, 8, 5), expected)


if __name__ == "__main__":
    unittest.main()

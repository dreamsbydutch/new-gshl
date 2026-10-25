import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from fetch_nhl_daily_stats import collect_power_play_points, is_power_play_goal, fetch_daily_stats, build_team_game_rows


class PowerPlayTests(unittest.TestCase):
    def test_schedule_cancellation_state_survives_fetch(self):
        client = SimpleNamespace(
            schedule=SimpleNamespace(daily_schedule=Mock(return_value={"games": [{"id": 1, "gameType": 2, "gameScheduleState": "PPD"}]})),
            game_center=SimpleNamespace(boxscore=Mock(return_value={"gameType": 2, "gameState": "FUT"}), play_by_play=Mock(return_value={})),
        )
        _, games, _, count = fetch_daily_stats(client, "2026-10-25")
        self.assertEqual(count, 1)
        self.assertEqual([game["gameScheduleState"] for game in games], ["PPD", "PPD"])
        client.game_center.boxscore.assert_not_called()
        client.game_center.play_by_play.assert_not_called()

    def test_missing_schedule_is_not_an_empty_completed_slate(self):
        client = SimpleNamespace(schedule=SimpleNamespace(daily_schedule=Mock(return_value={})))
        with self.assertRaisesRegex(RuntimeError, "Missing NHL schedule coverage"):
            fetch_daily_stats(client, "2026-10-25")

    def test_team_game_payload_keeps_completion_state(self):
        for state in ("FUT", "LIVE", "FINAL", "OFF"):
            rows = build_team_game_rows(date="2026-10-24", game_id=1,
                away_team={"abbrev": "TOR"}, home_team={"abbrev": "MTL"},
                game_has_started=state != "FUT", game_state=state)
            self.assertEqual([row["gameState"] for row in rows], [state, state])

    def test_failed_game_fetch_cannot_erase_existing_stats(self):
        for endpoint in ("boxscore", "play_by_play"):
            client = SimpleNamespace(
                schedule=SimpleNamespace(daily_schedule=Mock(return_value={"games": [{"id": 1, "gameType": 2}]})),
                game_center=SimpleNamespace(boxscore=Mock(return_value={"gameType": 2}), play_by_play=Mock(return_value={})),
            )
            getattr(client.game_center, endpoint).side_effect = RuntimeError("unavailable")
            with self.assertRaisesRegex(RuntimeError, "refusing partial stats"):
                fetch_daily_stats(client, "2026-10-03")
            getattr(client.game_center, endpoint).assert_called_once_with("1")

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

import unittest

from fetch_nhl_daily_stats import build_goalie_stat_row, reconcile_goalie_counts


def goalie_stats(row):
    return build_goalie_stat_row(
        date="2026-10-24", game_id=2026020176, season=20262027,
        game_type=2, team_id=22, team_abbr="EDM", opponent_abbr="TOR",
        opponent_display="TOR", score_display="L,2-7", team_goalies=[row],
        team_goals_against=7, row=row, roster_spot=None,
    )


class GoalieBoxscoreCountsTests(unittest.TestCase):
    def test_final_official_jarry_discrepancy_is_bound_to_identity_game_and_tuple(self):
        row = {"playerId": 8477465, "shotsAgainst": 30, "saves": 25,
               "goalsAgainst": 6, "toi": "59:45", "decision": "L"}
        context = {"date": "2026-10-24", "gameId": 2026020176,
                   "team": "EDM", "opponent": "TOR"}
        self.assertEqual(reconcile_goalie_counts(row, context), (30, 25, 6))
        for key, value in {"playerId": 1, "shotsAgainst": 31, "saves": 26,
                           "goalsAgainst": 7, "toi": "59:44", "decision": "W"}.items():
            # Keep each changed tuple inconsistent so it must pass the exception gate.
            if key == "shotsAgainst":
                value = 32
            with self.subTest(key=key), self.assertRaises(ValueError):
                reconcile_goalie_counts({**row, key: value}, context)
        for key in context:
            with self.subTest(key=key), self.assertRaises(ValueError):
                reconcile_goalie_counts(row, {**context, key: "wrong"})

    def test_consistent_native_counts_are_preserved_without_fallback_fields(self):
        self.assertEqual(reconcile_goalie_counts({"shotsAgainst": 30, "saves": 24,
                                                  "goalsAgainst": 6}), (30, 24, 6))

    def test_ambiguous_counts_fail_before_publication(self):
        row = {"shotsAgainst": 30, "saves": 25, "goalsAgainst": 6,
               "savePctg": .8, "evenStrengthShotsAgainst": "23/28",
               "powerPlayShotsAgainst": "0/1", "shorthandedShotsAgainst": "1/1"}
        for patch in ({"savePctg": .833333}, {"savePctg": None},
                      {"powerPlayShotsAgainst": "0/2"},
                      {"shorthandedShotsAgainst": "malformed"},
                      {"shorthandedShotsAgainst": "2/1"}):
            with self.subTest(patch=patch), self.assertRaisesRegex(ValueError, "Uncorroborated"):
                reconcile_goalie_counts({**row, **patch})
        with self.assertRaisesRegex(ValueError, "Uncorroborated"):
            reconcile_goalie_counts({"shotsAgainst": 30, "saves": 25, "goalsAgainst": 6})

    def test_goalie_counts_that_blocked_dutch_rudders_poo_balances_refresh(self):
        # Official boxscores' saves disagree with both strength splits and savePctg.
        # https://api-web.nhle.com/v1/gamecenter/2026020176/boxscore
        # https://api-web.nhle.com/v1/gamecenter/2026020177/boxscore
        for player, shots, goals, saves, pct, splits, expected in [
            (8477465, 30, 6, 25, .8, ("23/28", "0/1", "1/1"), "24"),
            (8478872, 11, 3, 9, .727273, ("5/7", "2/3", "1/1"), "8"),
        ]:
            with self.subTest(player=player):
                source = {
                    "playerId": player, "toi": "20:00", "shotsAgainst": shots,
                    "goalsAgainst": goals, "saves": saves, "savePctg": pct,
                    **dict(zip(("evenStrengthShotsAgainst", "powerPlayShotsAgainst",
                                "shorthandedShotsAgainst"), splits)),
                }
                result = goalie_stats(source)
                self.assertEqual(result["SV"], expected)
                self.assertEqual(int(result["SV"]) + int(result["GA"]), int(result["SA"]))
                self.assertAlmostEqual(float(result["SVP"]), pct, places=5)
                self.assertEqual(source["saves"], saves)


if __name__ == "__main__":
    unittest.main()

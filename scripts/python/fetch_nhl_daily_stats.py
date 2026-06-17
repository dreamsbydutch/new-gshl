#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from typing import Any

try:
    from nhlpy import NHLClient
except ImportError as error:  # pragma: no cover - startup path
    raise SystemExit(
        "Missing Python dependency 'nhl-api-py'. Install it with "
        "`python -m pip install -r scripts/python/requirements.txt`."
    ) from error


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch NHL daily player game stats with nhl-api-py and emit JSON "
            "for the local GSHL sync pipeline."
        )
    )
    parser.add_argument(
        "--dates",
        required=True,
        help="Comma-separated YYYY-MM-DD dates to fetch.",
    )
    parser.add_argument(
        "--ssl-verify",
        default="false",
        choices=("true", "false"),
        help=(
            "Whether the nhl-api-py client should verify TLS certificates. "
            "Defaults to false because some local Windows Python installs do "
            "not ship a working CA bundle."
        ),
    )
    parser.add_argument(
        "--season",
        default="",
        help="Optional NHL season token in YYYYYYYY format for roster lookups.",
    )
    return parser.parse_args()


def to_bool(value: str) -> bool:
    return str(value).strip().lower() == "true"


def parse_time_to_minutes(value: Any) -> float:
    text = str(value or "").strip()
    if not text:
        return 0.0
    if ":" not in text:
        try:
            return float(text)
        except ValueError:
            return 0.0
    minutes_text, seconds_text = text.split(":", 1)
    try:
        minutes = int(minutes_text)
        seconds = int(seconds_text)
    except ValueError:
        return 0.0
    return round(minutes + (seconds / 60.0), 2)


def format_number(value: Any) -> str:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return ""
    if numeric.is_integer():
        return str(int(numeric))
    return str(numeric)


def format_fixed(value: float, decimals: int) -> str:
    return f"{value:.{decimals}f}"


def normalize_position_code(value: Any) -> str:
    raw = str(value or "").strip().upper()
    if raw in {"L", "LW"}:
        return "LW"
    if raw in {"R", "RW"}:
        return "RW"
    if raw == "C":
        return "C"
    if raw == "D":
        return "D"
    if raw == "G":
        return "G"
    return raw


def infer_pos_group(position_code: str) -> str:
    if position_code == "G":
        return "G"
    if position_code == "D":
        return "D"
    return "F"


def iter_roster_players(roster: dict[str, Any]) -> list[dict[str, Any]]:
    players: list[dict[str, Any]] = []
    for key in ("forwards", "defensemen", "goalies"):
        players.extend(list(roster.get(key) or []))
    return players


def build_opponent_display(opponent_abbr: str, team_is_away: bool) -> str:
    normalized = str(opponent_abbr or "").strip().upper()
    if not normalized:
        return ""
    return f"@{normalized}" if team_is_away else normalized


def build_score_display(
    team_score: int,
    opponent_score: int,
    game_has_started: bool,
) -> str:
    if not game_has_started:
        return ""
    if team_score > opponent_score:
        result = "W"
    elif team_score < opponent_score:
        result = "L"
    else:
        result = "T"
    return f"{result},{team_score}-{opponent_score}"


def build_full_name(roster_spot: dict[str, Any]) -> str:
    first_name = str(
        ((roster_spot.get("firstName") or {}).get("default")) or ""
    ).strip()
    last_name = str(
        ((roster_spot.get("lastName") or {}).get("default")) or ""
    ).strip()
    return " ".join(part for part in (first_name, last_name) if part).strip()


def parse_situation_code(value: Any) -> tuple[int, int] | None:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if len(digits) != 4:
        return None
    try:
        away_skaters = int(digits[1])
        home_skaters = int(digits[2])
    except ValueError:
        return None
    return away_skaters, home_skaters


def is_power_play_goal(
    play: dict[str, Any],
    away_team_id: int,
    home_team_id: int,
) -> bool:
    if play.get("typeDescKey") != "goal":
        return False
    details = play.get("details") or {}
    owner_team_id = details.get("eventOwnerTeamId")
    skater_counts = parse_situation_code(play.get("situationCode"))
    if not skater_counts or owner_team_id not in {away_team_id, home_team_id}:
        return False
    away_skaters, home_skaters = skater_counts
    if owner_team_id == away_team_id:
        return away_skaters > home_skaters
    return home_skaters > away_skaters


def compute_goalie_shutout(
    goalie_row: dict[str, Any],
    team_goalies: list[dict[str, Any]],
    team_goals_against: int,
) -> str:
    toi_minutes = parse_time_to_minutes(goalie_row.get("toi"))
    if team_goals_against != 0 or toi_minutes <= 0:
        return ""
    active_goalies = [
        row
        for row in team_goalies
        if parse_time_to_minutes(row.get("toi")) > 0
    ]
    return "1" if len(active_goalies) == 1 else ""


def collect_power_play_points(
    play_by_play: dict[str, Any],
    away_team_id: int,
    home_team_id: int,
) -> dict[int, int]:
    counts: defaultdict[int, int] = defaultdict(int)
    for play in play_by_play.get("plays") or []:
        if not is_power_play_goal(play, away_team_id, home_team_id):
            continue
        details = play.get("details") or {}
        for key in (
            "scoringPlayerId",
            "assist1PlayerId",
            "assist2PlayerId",
        ):
            player_id = details.get(key)
            if isinstance(player_id, int):
                counts[player_id] += 1
    return dict(counts)


def get_boxscore_power_play_points(row: dict[str, Any]) -> int:
    power_play_points = row.get("powerPlayPoints")
    if isinstance(power_play_points, (int, float)):
        return int(power_play_points)
    power_play_goals = row.get("powerPlayGoals")
    if isinstance(power_play_goals, (int, float)):
        return int(power_play_goals)
    return 0


def build_roster_spot_map(play_by_play: dict[str, Any]) -> dict[int, dict[str, Any]]:
    roster_map: dict[int, dict[str, Any]] = {}
    for roster_spot in play_by_play.get("rosterSpots") or []:
        player_id = roster_spot.get("playerId")
        if isinstance(player_id, int):
            roster_map[player_id] = roster_spot
    return roster_map


def resolve_roster_spot_team_abbr(
    roster_spot: dict[str, Any],
    away_team: dict[str, Any],
    home_team: dict[str, Any],
) -> str:
    team_id = int(roster_spot.get("teamId") or 0)
    away_team_id = int(away_team.get("id") or 0)
    home_team_id = int(home_team.get("id") or 0)
    if team_id and team_id == away_team_id:
        return str(away_team.get("abbrev") or "").strip().upper()
    if team_id and team_id == home_team_id:
        return str(home_team.get("abbrev") or "").strip().upper()
    return ""


def build_game_roster_rows(
    *,
    date: str,
    game_id: int,
    away_team: dict[str, Any],
    home_team: dict[str, Any],
    roster_spots: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for roster_spot in roster_spots.values():
        player_id = roster_spot.get("playerId")
        if not isinstance(player_id, int):
            continue
        team_abbr = resolve_roster_spot_team_abbr(roster_spot, away_team, home_team)
        if not team_abbr:
            continue
        position_code = normalize_position_code(roster_spot.get("positionCode"))
        rows.append(
            {
                "date": date,
                "gameId": str(game_id),
                "nhlPlayerId": str(player_id),
                "nhlTeam": team_abbr,
                "positionCode": position_code,
                "posGroup": infer_pos_group(position_code),
            }
        )
    return rows


def build_season_roster_rows(
    client: NHLClient,
    *,
    season: str,
    reference_date: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for team in client.teams.teams(date=reference_date):
        team_abbr = str(team.get("abbr") or "").strip().upper()
        if not team_abbr:
            continue
        roster = client.teams.team_roster(team_abbr=team_abbr, season=season)
        for player in iter_roster_players(roster):
            player_id = player.get("id")
            if not isinstance(player_id, int):
                continue
            position_code = normalize_position_code(player.get("positionCode"))
            rows.append(
                {
                    "nhlPlayerId": str(player_id),
                    "nhlTeam": team_abbr,
                    "positionCode": position_code,
                    "posGroup": infer_pos_group(position_code),
                }
            )
    return rows


def build_skater_stat_row(
    *,
    date: str,
    game_id: int,
    season: int,
    game_type: int,
    team_abbr: str,
    team_id: int,
    opponent_abbr: str,
    opponent_display: str,
    score_display: str,
    row: dict[str, Any],
    roster_spot: dict[str, Any] | None,
    power_play_points: dict[int, int],
) -> dict[str, Any] | None:
    player_id = row.get("playerId")
    if not isinstance(player_id, int):
        return None

    toi_minutes = parse_time_to_minutes(row.get("toi"))
    if toi_minutes <= 0 and not any(
        row.get(field) not in (None, 0, "0", "", "0.0")
        for field in ("goals", "assists", "points", "sog", "hits", "blockedShots")
    ):
        return None

    position_code = normalize_position_code(
        (roster_spot or {}).get("positionCode") or row.get("position")
    )
    full_name = build_full_name(roster_spot or {})
    if not full_name:
        short_name = ((row.get("name") or {}).get("default")) or ""
        full_name = str(short_name).replace(".", "").strip()

    return {
        "date": date,
        "gameId": str(game_id),
        "season": str(season),
        "gameType": str(game_type),
        "nhlPlayerId": str(player_id),
        "fullName": full_name,
        "nhlTeam": team_abbr,
        "nhlTeamId": str(team_id),
        "opponentAbbr": opponent_abbr,
        "opp": opponent_display,
        "score": score_display,
        "positionCode": position_code,
        "posGroup": infer_pos_group(position_code),
        "GP": "1",
        "G": format_number(row.get("goals", 0)),
        "A": format_number(row.get("assists", 0)),
        "P": format_number(row.get("points", 0)),
        "PM": format_number(row.get("plusMinus", 0)),
        "PIM": format_number(row.get("pim", 0)),
        "PPP": format_number(
            max(
                int(power_play_points.get(player_id, 0)),
                get_boxscore_power_play_points(row),
            )
        ),
        "SOG": format_number(row.get("sog", 0)),
        "HIT": format_number(row.get("hits", 0)),
        "BLK": format_number(row.get("blockedShots", 0)),
        "W": "",
        "GA": "",
        "GAA": "",
        "SV": "",
        "SA": "",
        "SVP": "",
        "SO": "",
        "TOI": format_number(toi_minutes),
    }


def build_goalie_stat_row(
    *,
    date: str,
    game_id: int,
    season: int,
    game_type: int,
    team_abbr: str,
    team_id: int,
    opponent_abbr: str,
    opponent_display: str,
    score_display: str,
    team_goalies: list[dict[str, Any]],
    team_goals_against: int,
    row: dict[str, Any],
    roster_spot: dict[str, Any] | None,
) -> dict[str, Any] | None:
    player_id = row.get("playerId")
    if not isinstance(player_id, int):
        return None

    toi_minutes = parse_time_to_minutes(row.get("toi"))
    if toi_minutes <= 0:
        return None

    full_name = build_full_name(roster_spot or {})
    if not full_name:
        short_name = ((row.get("name") or {}).get("default")) or ""
        full_name = str(short_name).replace(".", "").strip()

    shots_against = int(row.get("shotsAgainst") or 0)
    saves = int(row.get("saves") or 0)
    goals_against = int(row.get("goalsAgainst") or 0)
    save_pct = format_fixed((saves / shots_against), 5) if shots_against > 0 else ""
    gaa = format_fixed((goals_against / toi_minutes) * 60, 5) if toi_minutes > 0 else ""
    decision = str(row.get("decision") or "").strip().upper()

    return {
        "date": date,
        "gameId": str(game_id),
        "season": str(season),
        "gameType": str(game_type),
        "nhlPlayerId": str(player_id),
        "fullName": full_name,
        "nhlTeam": team_abbr,
        "nhlTeamId": str(team_id),
        "opponentAbbr": opponent_abbr,
        "opp": opponent_display,
        "score": score_display,
        "positionCode": "G",
        "posGroup": "G",
        "GP": "1",
        "G": "",
        "A": "",
        "P": "",
        "PM": "",
        "PIM": "",
        "PPP": "",
        "SOG": "",
        "HIT": "",
        "BLK": "",
        "W": "1" if decision == "W" else "0",
        "GA": format_number(goals_against),
        "GAA": gaa,
        "SV": format_number(saves),
        "SA": format_number(shots_against),
        "SVP": save_pct,
        "SO": compute_goalie_shutout(row, team_goalies, team_goals_against),
        "TOI": format_number(toi_minutes),
    }


def collect_team_player_stats(
    *,
    date: str,
    game_id: int,
    season: int,
    game_type: int,
    side_key: str,
    opponent_abbr: str,
    opponent_display: str,
    score_display: str,
    team_summary: dict[str, Any],
    stats_by_team: dict[str, Any],
    roster_spots: dict[int, dict[str, Any]],
    power_play_points: dict[int, int],
    team_goals_against: int,
) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    team_abbr = str(team_summary.get("abbrev") or "").strip()
    team_id = int(team_summary.get("id") or 0)

    for group_key in ("forwards", "defense"):
        for row in stats_by_team.get(group_key) or []:
            stat_row = build_skater_stat_row(
                date=date,
                game_id=game_id,
                season=season,
                game_type=game_type,
                team_abbr=team_abbr,
                team_id=team_id,
                opponent_abbr=opponent_abbr,
                opponent_display=opponent_display,
                score_display=score_display,
                row=row,
                roster_spot=roster_spots.get(row.get("playerId")),
                power_play_points=power_play_points,
            )
            if stat_row is not None:
                output.append(stat_row)

    team_goalies = list(stats_by_team.get("goalies") or [])
    for row in team_goalies:
        stat_row = build_goalie_stat_row(
            date=date,
            game_id=game_id,
            season=season,
            game_type=game_type,
                team_abbr=team_abbr,
                team_id=team_id,
                opponent_abbr=opponent_abbr,
                opponent_display=opponent_display,
                score_display=score_display,
                team_goalies=team_goalies,
                team_goals_against=team_goals_against,
                row=row,
            roster_spot=roster_spots.get(row.get("playerId")),
        )
        if stat_row is not None:
            output.append(stat_row)

    return output


def build_team_game_rows(
    *,
    date: str,
    game_id: int,
    away_team: dict[str, Any],
    home_team: dict[str, Any],
    game_has_started: bool,
) -> list[dict[str, Any]]:
    away_abbr = str(away_team.get("abbrev") or "").strip().upper()
    home_abbr = str(home_team.get("abbrev") or "").strip().upper()
    away_score = int(away_team.get("score") or 0)
    home_score = int(home_team.get("score") or 0)

    return [
        {
            "date": date,
            "gameId": str(game_id),
            "teamAbbr": away_abbr,
            "opponentAbbr": home_abbr,
            "opp": build_opponent_display(home_abbr, True),
            "score": build_score_display(away_score, home_score, game_has_started),
        },
        {
            "date": date,
            "gameId": str(game_id),
            "teamAbbr": home_abbr,
            "opponentAbbr": away_abbr,
            "opp": build_opponent_display(away_abbr, False),
            "score": build_score_display(home_score, away_score, game_has_started),
        },
    ]


def fetch_daily_stats(
    client: NHLClient,
    date: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], int]:
    schedule = client.schedule.daily_schedule(date=date)
    games = schedule.get("games") or []
    output: list[dict[str, Any]] = []
    team_games: list[dict[str, Any]] = []
    roster_players: list[dict[str, Any]] = []

    for game in games:
        try:
            game_id = int(game.get("id"))
            boxscore = client.game_center.boxscore(str(game_id))
            try:
                play_by_play = client.game_center.play_by_play(str(game_id))
            except Exception as error:
                print(
                    f"[fetch_nhl_daily_stats] Warning: play-by-play unavailable for game {game_id} on {date}: {error}",
                    file=sys.stderr,
                )
                play_by_play = {}
            away_team = boxscore.get("awayTeam") or {}
            home_team = boxscore.get("homeTeam") or {}
            away_team_id = int(away_team.get("id") or 0)
            home_team_id = int(home_team.get("id") or 0)
            roster_spots = build_roster_spot_map(play_by_play)
            power_play_points = collect_power_play_points(
                play_by_play,
                away_team_id,
                home_team_id,
            )
            player_stats = boxscore.get("playerByGameStats") or {}
            away_player_stats = player_stats.get("awayTeam") or {}
            home_player_stats = player_stats.get("homeTeam") or {}
            game_has_started = any(
                bool(team_stats.get(group_key))
                for team_stats in (away_player_stats, home_player_stats)
                for group_key in ("forwards", "defense", "goalies")
            ) or any(
                score is not None
                for score in (away_team.get("score"), home_team.get("score"))
            )

            team_games.extend(
                build_team_game_rows(
                    date=date,
                    game_id=game_id,
                    away_team=away_team,
                    home_team=home_team,
                    game_has_started=game_has_started,
                )
            )
            roster_players.extend(
                build_game_roster_rows(
                    date=date,
                    game_id=game_id,
                    away_team=away_team,
                    home_team=home_team,
                    roster_spots=roster_spots,
                )
            )

            output.extend(
                collect_team_player_stats(
                    date=date,
                    game_id=game_id,
                    season=int(boxscore.get("season") or 0),
                    game_type=int(boxscore.get("gameType") or 0),
                    side_key="awayTeam",
                    opponent_abbr=str(home_team.get("abbrev") or "").strip(),
                    opponent_display=build_opponent_display(
                        str(home_team.get("abbrev") or "").strip(),
                        True,
                    ),
                    score_display=build_score_display(
                        int(away_team.get("score") or 0),
                        int(home_team.get("score") or 0),
                        game_has_started,
                    ),
                    team_summary=away_team,
                    stats_by_team=away_player_stats,
                    roster_spots=roster_spots,
                    power_play_points=power_play_points,
                    team_goals_against=int(home_team.get("score") or 0),
                ),
            )
            output.extend(
                collect_team_player_stats(
                    date=date,
                    game_id=game_id,
                    season=int(boxscore.get("season") or 0),
                    game_type=int(boxscore.get("gameType") or 0),
                    side_key="homeTeam",
                    opponent_abbr=str(away_team.get("abbrev") or "").strip(),
                    opponent_display=build_opponent_display(
                        str(away_team.get("abbrev") or "").strip(),
                        False,
                    ),
                    score_display=build_score_display(
                        int(home_team.get("score") or 0),
                        int(away_team.get("score") or 0),
                        game_has_started,
                    ),
                    team_summary=home_team,
                    stats_by_team=home_player_stats,
                    roster_spots=roster_spots,
                    power_play_points=power_play_points,
                    team_goals_against=int(away_team.get("score") or 0),
                ),
            )
        except Exception as error:
            print(
                f"[fetch_nhl_daily_stats] Warning: skipping game {game.get('id')} on {date}: {error}",
                file=sys.stderr,
            )
            continue

    return output, team_games, roster_players, len(games)


def main() -> int:
    args = parse_args()
    dates = [part.strip() for part in args.dates.split(",") if part.strip()]
    if not dates:
        raise SystemExit("At least one date is required.")

    client = NHLClient(ssl_verify=to_bool(args.ssl_verify))
    players: list[dict[str, Any]] = []
    team_games: list[dict[str, Any]] = []
    roster_players: list[dict[str, Any]] = []
    games_by_date: dict[str, int] = {}

    for date in dates:
        try:
            date_players, date_team_games, date_roster_players, game_count = fetch_daily_stats(client, date)
        except Exception as error:
            print(
                f"[fetch_nhl_daily_stats] Warning: skipping date {date}: {error}",
                file=sys.stderr,
            )
            games_by_date[date] = 0
            continue
        games_by_date[date] = game_count
        players.extend(date_players)
        team_games.extend(date_team_games)
        roster_players.extend(date_roster_players)

    season_roster_players: list[dict[str, Any]] = []
    season = str(args.season or "").strip()
    if season:
        season_roster_players = build_season_roster_rows(
            client,
            season=season,
            reference_date=dates[-1],
        )

    payload = {
        "dates": dates,
        "gamesByDate": games_by_date,
        "players": players,
        "teamGames": team_games,
        "rosterPlayers": roster_players,
        "seasonRosterPlayers": season_roster_players,
    }
    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
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
            "Fetch current NHL roster players and ids with nhl-api-py and emit "
            "JSON for the local GSHL player id backfill."
        )
    )
    parser.add_argument(
        "--season",
        required=True,
        help="NHL season token in YYYYYYYY format, for example 20252026.",
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
    return parser.parse_args()


def to_bool(value: str) -> bool:
    return str(value).strip().lower() == "true"


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


def get_localized_name(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("default") or "").strip()
    return str(value or "").strip()


def build_full_name(player: dict[str, Any]) -> str:
    first_name = get_localized_name(player.get("firstName"))
    last_name = get_localized_name(player.get("lastName"))
    return " ".join(part for part in (first_name, last_name) if part).strip()


def iter_roster_players(roster: dict[str, Any]) -> list[dict[str, Any]]:
    players: list[dict[str, Any]] = []
    for key in ("forwards", "defensemen", "goalies"):
        players.extend(list(roster.get(key) or []))
    return players


def build_player_row(
    *,
    season: str,
    team: dict[str, Any],
    player: dict[str, Any],
) -> dict[str, Any] | None:
    player_id = player.get("id")
    if not isinstance(player_id, int):
        return None

    position_code = normalize_position_code(player.get("positionCode"))
    return {
        "season": season,
        "nhlApiId": str(player_id),
        "firstName": get_localized_name(player.get("firstName")),
        "lastName": get_localized_name(player.get("lastName")),
        "fullName": build_full_name(player),
        "teamAbbr": str(team.get("abbr") or "").strip().upper(),
        "teamName": str(team.get("name") or "").strip(),
        "positionCode": position_code,
        "posGroup": infer_pos_group(position_code),
        "birthDate": str(player.get("birthDate") or "").strip(),
        "shootsCatches": str(player.get("shootsCatches") or "").strip(),
        "jerseyNum": str(player.get("sweaterNumber") or "").strip(),
        "birthCountry": str(player.get("birthCountry") or "").strip(),
    }


def fetch_rosters(client: NHLClient, season: str) -> tuple[list[dict[str, Any]], int]:
    teams = client.teams.teams(date="now")
    output: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for team in teams:
        team_abbr = str(team.get("abbr") or "").strip().upper()
        if not team_abbr:
            continue
        roster = client.teams.team_roster(team_abbr=team_abbr, season=season)
        for player in iter_roster_players(roster):
            row = build_player_row(season=season, team=team, player=player)
            if row is None:
                continue
            player_id = row["nhlApiId"]
            if player_id in seen_ids:
                continue
            seen_ids.add(player_id)
            output.append(row)

    return output, len(teams)


def main() -> int:
    args = parse_args()
    season = args.season.strip()
    if not season:
        raise SystemExit("A season token is required.")

    client = NHLClient(ssl_verify=to_bool(args.ssl_verify))
    players, team_count = fetch_rosters(client, season)
    payload = {
        "season": season,
        "teamCount": team_count,
        "players": players,
    }
    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

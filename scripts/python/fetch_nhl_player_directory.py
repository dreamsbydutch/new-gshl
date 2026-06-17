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


SKATER_GAME_TYPE_ID = 2
PLAYOFF_GAME_TYPE_ID = 3
PAGE_SIZE = 100


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build a historical NHL player directory with stable ids from "
            "season stat summaries plus current team rosters."
        )
    )
    parser.add_argument(
        "--start-season",
        required=True,
        help="Inclusive NHL season token in YYYYYYYY format, for example 20142015.",
    )
    parser.add_argument(
        "--end-season",
        required=True,
        help="Inclusive NHL season token in YYYYYYYY format, for example 20252026.",
    )
    parser.add_argument(
        "--include-current-rosters",
        default="true",
        choices=("true", "false"),
        help="Whether to layer in current team rosters for active zero-game players.",
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


def season_token_to_years(token: str) -> tuple[int, int]:
    cleaned = token.strip()
    if len(cleaned) != 8 or not cleaned.isdigit():
      raise ValueError(f"Invalid season token: {token}")
    return int(cleaned[:4]), int(cleaned[4:])


def build_season_tokens(start_token: str, end_token: str) -> list[str]:
    start_year, start_end_year = season_token_to_years(start_token)
    end_year, end_end_year = season_token_to_years(end_token)
    if start_end_year != start_year + 1 or end_end_year != end_year + 1:
        raise ValueError("Season tokens must be contiguous YYYYYYYY values.")
    if start_year > end_year:
        raise ValueError("start-season cannot be after end-season.")
    return [f"{year}{year + 1}" for year in range(start_year, end_year + 1)]


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


def split_team_abbrevs(value: Any) -> list[str]:
    raw = str(value or "").strip().upper()
    if not raw:
        return []
    parts = [part.strip() for part in raw.replace("/", ",").split(",")]
    return [part for part in parts if part]


def get_localized_name(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("default") or "").strip()
    return str(value or "").strip()


def derive_first_name(full_name: str, last_name: str) -> str:
    normalized_full = full_name.strip()
    normalized_last = last_name.strip()
    if not normalized_full:
        return ""
    if normalized_last and normalized_full.endswith(normalized_last):
        candidate = normalized_full[: -len(normalized_last)].strip()
        if candidate:
            return candidate
    return normalized_full.split(" ", 1)[0].strip()


def empty_profile(player_id: str) -> dict[str, Any]:
    return {
        "nhlApiId": player_id,
        "fullName": "",
        "firstName": "",
        "lastName": "",
        "birthDate": "",
        "birthCountry": "",
        "shootsCatches": "",
        "teamAbbrs": [],
        "positionCodes": [],
        "posGroups": [],
        "seasons": [],
        "sources": [],
    }


def add_unique_string(target: dict[str, Any], key: str, value: Any) -> None:
    normalized = str(value or "").strip()
    if not normalized:
        return
    bucket = target[key]
    if normalized not in bucket:
        bucket.append(normalized)


def merge_profile(
    profiles: dict[str, dict[str, Any]],
    *,
    player_id: str,
    full_name: str,
    last_name: str,
    first_name: str,
    birth_date: str,
    birth_country: str,
    shoots_catches: str,
    team_abbrs: list[str],
    position_codes: list[str],
    seasons: list[str],
    source: str,
) -> None:
    profile = profiles.setdefault(player_id, empty_profile(player_id))

    full_name = full_name.strip()
    last_name = last_name.strip()
    first_name = first_name.strip() or derive_first_name(full_name, last_name)
    birth_date = birth_date.strip()
    birth_country = birth_country.strip().upper()
    shoots_catches = shoots_catches.strip().upper()

    if full_name and (not profile["fullName"] or len(full_name) > len(profile["fullName"])):
        profile["fullName"] = full_name
    if first_name and not profile["firstName"]:
        profile["firstName"] = first_name
    if last_name and not profile["lastName"]:
        profile["lastName"] = last_name
    if birth_date and not profile["birthDate"]:
        profile["birthDate"] = birth_date
    if birth_country and not profile["birthCountry"]:
        profile["birthCountry"] = birth_country
    if shoots_catches and not profile["shootsCatches"]:
        profile["shootsCatches"] = shoots_catches

    for team_abbr in team_abbrs:
        add_unique_string(profile, "teamAbbrs", team_abbr.upper())
    for position_code in position_codes:
        normalized_position = normalize_position_code(position_code)
        if not normalized_position:
            continue
        add_unique_string(profile, "positionCodes", normalized_position)
        add_unique_string(profile, "posGroups", infer_pos_group(normalized_position))
    for season in seasons:
        add_unique_string(profile, "seasons", season)
    add_unique_string(profile, "sources", source)


def fetch_paged_skater_rows(client: NHLClient, season: str, game_type_id: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        batch = client.stats.skater_stats_summary(
            start_season=season,
            end_season=season,
            game_type_id=game_type_id,
            start=start,
            limit=PAGE_SIZE,
        )
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    return rows


def fetch_paged_goalie_rows(client: NHLClient, season: str, game_type_id: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        batch = client.stats.goalie_stats_summary(
            start_season=season,
            end_season=season,
            game_type_id=game_type_id,
            start=start,
            limit=PAGE_SIZE,
        )
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    return rows


def add_stat_summary_profiles(
    profiles: dict[str, dict[str, Any]],
    season: str,
    rows: list[dict[str, Any]],
    *,
    full_name_key: str,
    source: str,
    default_position_code: str | None = None,
) -> None:
    for row in rows:
        player_id = row.get("playerId")
        if not isinstance(player_id, int):
            continue

        full_name = str(row.get(full_name_key) or "").strip()
        last_name = str(row.get("lastName") or "").strip()
        merge_profile(
            profiles,
            player_id=str(player_id),
            full_name=full_name,
            last_name=last_name,
            first_name=derive_first_name(full_name, last_name),
            birth_date="",
            birth_country="",
            shoots_catches=str(row.get("shootsCatches") or "").strip(),
            team_abbrs=split_team_abbrevs(row.get("teamAbbrevs")),
            position_codes=[default_position_code or str(row.get("positionCode") or "").strip()],
            seasons=[season],
            source=source,
        )


def add_current_roster_profiles(
    client: NHLClient,
    profiles: dict[str, dict[str, Any]],
    season: str,
) -> int:
    teams = client.teams.teams(date="now")
    team_count = 0

    for team in teams:
        team_abbr = str(team.get("abbr") or "").strip().upper()
        if not team_abbr:
            continue
        team_count += 1
        roster = client.teams.team_roster(team_abbr=team_abbr, season=season)
        for group in ("forwards", "defensemen", "goalies"):
            for player in roster.get(group) or []:
                player_id = player.get("id")
                if not isinstance(player_id, int):
                    continue
                first_name = get_localized_name(player.get("firstName"))
                last_name = get_localized_name(player.get("lastName"))
                full_name = " ".join(part for part in (first_name, last_name) if part).strip()
                position_code = normalize_position_code(player.get("positionCode"))
                merge_profile(
                    profiles,
                    player_id=str(player_id),
                    full_name=full_name,
                    last_name=last_name,
                    first_name=first_name,
                    birth_date=str(player.get("birthDate") or "").strip(),
                    birth_country=str(player.get("birthCountry") or "").strip(),
                    shoots_catches=str(player.get("shootsCatches") or "").strip(),
                    team_abbrs=[team_abbr],
                    position_codes=[position_code],
                    seasons=[season],
                    source="current-roster",
                )

    return team_count


def main() -> int:
    args = parse_args()
    season_tokens = build_season_tokens(args.start_season, args.end_season)
    include_current_rosters = to_bool(args.include_current_rosters)
    client = NHLClient(ssl_verify=to_bool(args.ssl_verify))

    profiles: dict[str, dict[str, Any]] = {}
    skater_rows = 0
    goalie_rows = 0

    for season in season_tokens:
        for game_type_id, label in (
            (SKATER_GAME_TYPE_ID, "regular"),
            (PLAYOFF_GAME_TYPE_ID, "playoffs"),
        ):
            season_skaters = fetch_paged_skater_rows(client, season, game_type_id)
            skater_rows += len(season_skaters)
            add_stat_summary_profiles(
                profiles,
                season,
                season_skaters,
                full_name_key="skaterFullName",
                source=f"skater-stats-{label}",
            )

            season_goalies = fetch_paged_goalie_rows(client, season, game_type_id)
            goalie_rows += len(season_goalies)
            add_stat_summary_profiles(
                profiles,
                season,
                season_goalies,
                full_name_key="goalieFullName",
                source=f"goalie-stats-{label}",
                default_position_code="G",
            )

    roster_team_count = 0
    if include_current_rosters:
        roster_team_count = add_current_roster_profiles(
            client,
            profiles,
            season_tokens[-1],
        )

    payload = {
        "startSeason": season_tokens[0],
        "endSeason": season_tokens[-1],
        "seasonCount": len(season_tokens),
        "currentRosterTeamCount": roster_team_count,
        "statRowsFetched": {
            "skaters": skater_rows,
            "goalies": goalie_rows,
        },
        "players": sorted(
            profiles.values(),
            key=lambda player: (player["fullName"], player["nhlApiId"]),
        ),
    }
    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

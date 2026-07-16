"use client";

import { useMemo } from "react";
import {
  getAwardLabel,
  getAwardTeamId,
  getPlayerAwardPlayerId,
} from "@gshl-lib/config/awards";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@gshl-ui";
import type { GSHLTeam, Player, PlayerAward, Season } from "@gshl-types";

interface TeamRecordBookProps {
  awards: PlayerAward[];
  allTeams: GSHLTeam[];
  currentTeam: GSHLTeam;
  players: Player[];
  seasons: Season[];
}

export function TeamRecordBook({
  awards,
  allTeams,
  currentTeam,
  players,
  seasons,
}: TeamRecordBookProps) {
  const rows = useMemo(() => {
    const franchiseTeamIds = new Set(
      allTeams
        .filter(
          (team) =>
            team.franchiseId === currentTeam.franchiseId ||
            (currentTeam.ownerId && team.ownerId === currentTeam.ownerId),
        )
        .map((team) => String(team.id)),
    );
    const playerById = new Map(
      players.map((player) => [String(player.id), player]),
    );
    const yearBySeason = new Map(
      seasons.map((season) => [String(season.id), season.year]),
    );

    return awards
      .filter((award) => franchiseTeamIds.has(getAwardTeamId(award)))
      .map((award) => {
        const playerId = getPlayerAwardPlayerId(award);
        return {
          award,
          playerId,
          label: getAwardLabel(award.award),
          player: playerById.get(playerId),
          year: yearBySeason.get(String(award.seasonId)) ?? award.seasonId,
        };
      })
      .sort(
        (a, b) =>
          a.label.localeCompare(b.label) ||
          Number(b.year) - Number(a.year) ||
          (a.player?.fullName ?? "").localeCompare(b.player?.fullName ?? ""),
      );
  }, [allTeams, awards, currentTeam, players, seasons]);

  const counts = useMemo(() => {
    const values = new Map<string, number>();
    for (const row of rows)
      values.set(row.label, (values.get(row.label) ?? 0) + 1);
    return Array.from(values.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  if (!rows.length) {
    return (
      <p className="px-6 py-10 text-center text-sm text-muted-foreground">
        No player awards on record yet.
      </p>
    );
  }

  return (
    <section className="mx-auto max-w-6xl space-y-8 px-3 pb-12 sm:px-6">
      <div className="flex flex-wrap justify-center gap-2">
        {counts.map(([label, count]) => (
          <div
            key={label}
            className="rounded-full border bg-white px-3 py-1 text-sm shadow-sm"
          >
            <span className="font-semibold">{count}</span> {label}
            {count === 1 ? "" : "s"}
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-20">Season</TableHead>
              <TableHead>Award</TableHead>
              <TableHead>Player</TableHead>
              <TableHead className="w-24">Position</TableHead>
              <TableHead className="w-24">NHL Team</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ award, label, player, playerId, year }) => (
              <TableRow key={award.id}>
                <TableCell className="font-semibold">{year}</TableCell>
                <TableCell>{label}</TableCell>
                <TableCell className="font-medium">
                  {player?.fullName ?? `Player ${playerId}`}
                </TableCell>
                <TableCell>
                  {Array.isArray(player?.nhlPos)
                    ? player.nhlPos.join("/")
                    : "-"}
                </TableCell>
                <TableCell>{player?.nhlTeam ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

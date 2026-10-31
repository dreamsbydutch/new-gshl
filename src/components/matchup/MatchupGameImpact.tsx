import React from "react";
import Image from "next/image";
import type {
  MatchupDetailsTeam,
  MatchupPlayerWeekRow,
  PlayerStatRow,
} from "@gshl-types";
import { formatMatchupPlayerName } from "@gshl-utils/features/matchup-details";
import { playerWeekPerformanceRating } from "@gshl-utils/domain/player-week-rating";

export function GameTeamLogo({
  team,
  size = 24,
}: {
  team: MatchupDetailsTeam | null;
  size?: 20 | 24;
}) {
  return team?.logoUrl ? (
    <Image
      src={team.logoUrl}
      alt={team.name ?? team.abbr ?? "GSHL team"}
      width={size}
      height={size}
      className={`${size === 20 ? "h-5 w-5" : "h-6 w-6"} shrink-0 object-contain`}
    />
  ) : (
    <span className="shrink-0 text-[11px] font-semibold">
      {team?.abbr ?? "Team"}
    </span>
  );
}

const rating = playerWeekPerformanceRating;

export function MatchupGameImpact({
  team,
  players,
  roster,
  standouts = [],
}: {
  team: MatchupDetailsTeam | null;
  players: PlayerStatRow[];
  roster: MatchupPlayerWeekRow[];
  standouts?: { id: string; overallRk?: number | null }[];
}) {
  const stars = new Set(standouts.map((player) => player.id));
  const weeklyPlayers = roster.filter((player) =>
    players.some((participant) => participant.id === player.id),
  );
  const rated = weeklyPlayers
    .map(rating)
    .filter((value): value is number => value != null);
  const average = rated.length
    ? rated.reduce((sum, value) => sum + value, 0) / rated.length
    : null;
  const pace = (
    ["G", "A", "P", "PIM", "PPP", "SOG", "HIT", "BLK", "W", "SV", "SO"] as const
  )
    .map((key) => {
      const eligible = weeklyPlayers.filter(
        (p) =>
          Number(p.GP) > 0 &&
          p[key] != null &&
          p[key] !== "" &&
          Number.isFinite(Number(p[key])),
      );
      return {
        key,
        value: eligible.reduce(
          (sum, p) => sum + Number(p[key]) / Number(p.GP),
          0,
        ),
      };
    })
    .filter((stat) => stat.value > 0);
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <GameTeamLogo team={team} />
        <span className="truncate font-semibold">
          {team?.abbr ?? team?.name ?? "Team"}
        </span>
        <span className="ml-auto whitespace-nowrap text-[10px] text-slate-500">
          {players.length} playing
        </span>
      </div>
      {players.length ? (
        <>
          <div className="mb-2 space-y-1">
            {players.map((player) => (
              <div key={player.id} className="flex items-start gap-1">
                <span className="min-w-0 flex-1">
                  {stars.has(player.id) ? (
                    <span
                      className="text-amber-600"
                      title="Top three on this roster by published overall rank"
                      aria-label="Roster standout"
                    >
                      ★{" "}
                    </span>
                  ) : null}
                  {formatMatchupPlayerName(player)}
                </span>
                <span className="text-[10px] text-slate-500">
                  {player.nhlPos?.join("/")}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {pace.map((stat) => (
              <span
                key={stat.key}
                className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] tabular-nums"
              >
                {stat.value.toFixed(1)} {stat.key}
              </span>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-slate-500">
            {average != null ? (
              <>
                Avg rating{" "}
                <strong className="text-slate-700">{average.toFixed(1)}</strong>
                {rated.length < players.length
                  ? ` (${rated.length}/${players.length} rated)`
                  : ""}
              </>
            ) : (
              "Rating unavailable"
            )}
            {pace.length
              ? " · Weekly pace / game (known stats)"
              : " · No weekly stat pace yet"}
          </div>
          {average != null ? (
            <div
              className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100"
              aria-label={`Average weekly performance rating ${average.toFixed(1)} out of 100`}
            >
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${average}%` }}
              />
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-slate-400">No players in this game</p>
      )}
    </div>
  );
}

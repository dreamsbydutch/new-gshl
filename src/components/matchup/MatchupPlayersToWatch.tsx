"use client";

import Image from "next/image";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import type { MatchupDetailsPayload, MatchupDetailsTeam } from "@gshl-types";
import { useMatchupPlayersToWatch } from "@gshl-hooks/features/useMatchupPlayersToWatch";

function TeamPreview({
  team,
  teamId,
}: {
  team: MatchupDetailsTeam | null;
  teamId: string;
}) {
  const preview = useMatchupPlayersToWatch(teamId);
  return (
    <div className="min-w-0 p-3">
      <h3 className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
        {team?.logoUrl ? (
          <Image
            src={team.logoUrl}
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 object-contain"
          />
        ) : null}
        <span className="truncate">{team?.name ?? "Team"}</span>
      </h3>
      {preview.isLoading ? (
        <p role="status" className="text-xs text-slate-600">
          Loading players…
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {preview.players.map(({ position, label, player }) => (
            <li
              key={position}
              className="flex min-h-12 items-center gap-2 py-1.5 text-xs"
            >
              <span className="w-14 shrink-0 text-slate-600">{label}</span>
              {player ? (
                <>
                  <NHLLogo
                    team={{ name: player.nhlTeam, logoUrl: "" }}
                    size={22}
                    className="!mx-0 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate font-semibold text-slate-900"
                      title={player.fullName}
                    >
                      {player.fullName}
                    </div>
                    <div className="truncate text-slate-600">
                      {player.nhlPos.join(" / ")}
                      {player.lineupPos === "IR" || player.lineupPos === "IRplus"
                        ? " · Injured reserve"
                        : ""}
                    </div>
                  </div>
                  <span className="shrink-0 text-right tabular-nums text-slate-700">
                    <span className="block font-semibold">
                      #{player.overallRk}
                    </span>
                    <span className="block text-[10px]">Overall</span>
                  </span>
                </>
              ) : (
                <span className="text-slate-600">
                  No ranked player available
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MatchupPlayersToWatch({
  details,
}: {
  details: MatchupDetailsPayload;
}) {
  return (
    <section
      aria-labelledby="players-to-watch-heading"
      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm sm:rounded-2xl"
    >
      <div className="border-b border-slate-200 px-3 py-2">
        <h2
          id="players-to-watch-heading"
          className="font-oswald text-lg text-slate-900"
        >
          Players to Watch
        </h2>
        <p className="text-xs text-slate-600">
          Top-ranked players at each position on the current rosters.
        </p>
      </div>
      <div className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <TeamPreview
          team={details.teams.away}
          teamId={details.matchup.awayTeamId}
        />
        <TeamPreview
          team={details.teams.home}
          teamId={details.matchup.homeTeamId}
        />
      </div>
    </section>
  );
}

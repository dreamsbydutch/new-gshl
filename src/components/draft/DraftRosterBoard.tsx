"use client";

import Image from "next/image";
import { MonitorUp } from "lucide-react";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { useDraftRosterBoard } from "@gshl-hooks";
import {
  buildCurrentRoster,
  buildTeamLineup,
  cn,
  formatNumber,
  formatUfaStat,
  getBenchPlayers,
  getDraftYear,
  getPlayerNhlAbbreviation,
  getRosterRatingClass,
} from "@gshl-utils";
import type {
  DraftHubEligiblePlayerView,
  DraftRosterConferenceView,
  DraftRosterTeamView,
  NHLTeam,
  Player,
} from "@gshl-types";

function RosterPlayer({
  player,
  nhlTeamByAbbr,
}: {
  player: Player;
  nhlTeamByAbbr: Map<string, NHLTeam>;
}) {
  const nhlAbbr = getPlayerNhlAbbreviation(player);
  const nhlTeam = nhlAbbr ? nhlTeamByAbbr.get(nhlAbbr) : undefined;
  const rating =
    typeof player.seasonRating === "number" &&
    Number.isFinite(player.seasonRating)
      ? formatNumber(player.seasonRating, 2)
      : "--";

  return (
    <div
      className="min-w-0 rounded border border-slate-200 bg-white px-1 py-0.5 text-center shadow-sm"
      title={`${player.fullName} · ${player.nhlPos.join("/")} · ${rating}`}
    >
      <p className="whitespace-normal break-words text-[10px] font-bold leading-[11px] text-slate-900">
        {player.fullName}
      </p>
      <div className="mt-0.5 flex items-center justify-center gap-1">
        <NHLLogo team={nhlTeam} size={12} />
        <span className="break-words text-[9px] leading-[10px] text-slate-500">
          {player.nhlPos.join("/")}
        </span>
        <span
          className={cn(
            "rounded px-1 text-[9px] font-bold leading-3 text-slate-800",
            getRosterRatingClass(player.seasonRk),
          )}
        >
          {rating}
        </span>
      </div>
    </div>
  );
}

function TeamRosterCard({
  team,
  players,
  nhlTeamByAbbr,
  className,
}: {
  team: DraftRosterTeamView;
  players: Player[];
  nhlTeamByAbbr: Map<string, NHLTeam>;
  className?: string;
}) {
  const roster = buildCurrentRoster(players, team);
  const lineup = buildTeamLineup(roster);
  const bench = getBenchPlayers(roster);

  return (
    <article
      className={cn(
        "flex min-h-0 flex-col overflow-y-auto overflow-x-hidden rounded-lg border border-slate-200 bg-white shadow-sm",
        className,
      )}
    >
      <header className="flex min-h-9 shrink-0 items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-1.5 py-1">
        {team.logoUrl ? (
          <Image
            src={team.logoUrl}
            alt={`${team.name ?? team.abbr ?? "Team"} logo`}
            width={24}
            height={24}
            className="h-6 w-6 shrink-0 object-contain"
          />
        ) : (
          <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-200 text-[9px] font-bold">
            {team.abbr ?? "?"}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="whitespace-normal break-words text-[11px] font-black leading-3 text-slate-950">
            {team.name ?? team.abbr ?? "Team"}
          </h3>
          <p className="text-[9px] leading-[10px] text-slate-500">
            {roster.length} players
          </p>
        </div>
        <div
          className="ml-auto shrink-0 text-right"
          title="Live talent rating across 15 weighted roster slots. Empty slots count as zero; primary starters count most, followed by secondary starters and goalie, utility, then bench."
        >
          <p className="text-[8px] font-bold uppercase tracking-wide text-slate-500">
            Talent
          </p>
          <p className="text-[11px] font-black tabular-nums text-primary">
            {team.talentRating === null
              ? "--"
              : formatNumber(team.talentRating, 2)}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-1 p-1">
        {lineup.map((section, sectionIndex) => (
          <section
            key={sectionIndex}
            className="space-y-0.5 border-b border-slate-300 pb-1 last:border-0"
            aria-label={
              sectionIndex === 0
                ? "Forwards"
                : sectionIndex === 1
                  ? "Defense"
                  : "Goalies"
            }
          >
            {section.map((row, rowIndex) => {
              const rowPlayers = row.filter(
                (player): player is Player => player !== null,
              );
              if (rowPlayers.length === 0) return null;
              return (
                <div
                  key={rowIndex}
                  className="grid gap-0.5"
                  style={{
                    gridTemplateColumns: `repeat(${rowPlayers.length}, minmax(0, 1fr))`,
                  }}
                >
                  {rowPlayers.map((player) => (
                    <RosterPlayer
                      key={player.id}
                      player={player}
                      nhlTeamByAbbr={nhlTeamByAbbr}
                    />
                  ))}
                </div>
              );
            })}
          </section>
        ))}

        {bench.length ? (
          <section aria-label="Bench">
            <p className="mb-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-500">
              Bench
            </p>
            <div className="grid grid-cols-2 gap-0.5">
              {bench.map((player) => (
                <RosterPlayer
                  key={player.id}
                  player={player}
                  nhlTeamByAbbr={nhlTeamByAbbr}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </article>
  );
}

function ConferenceRosterCard({
  conference,
  players,
  nhlTeamByAbbr,
  shiftBottomTeams,
}: {
  conference: DraftRosterConferenceView;
  players: Player[];
  nhlTeamByAbbr: Map<string, NHLTeam>;
  shiftBottomTeams: boolean;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
      <header className="mb-1 flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border-b border-slate-200 bg-slate-50 text-slate-900">
        {conference.logoUrl ? (
          <Image
            src={conference.logoUrl}
            alt={`${conference.name} logo`}
            width={24}
            height={24}
            className="h-6 w-6 object-contain"
          />
        ) : null}
        <h2 className="text-[15px] font-black uppercase tracking-[0.14em]">
          {conference.name}
        </h2>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-2 gap-1.5">
        {conference.teams.map((team, teamIndex) => (
          <TeamRosterCard
            key={team.id}
            team={team}
            players={players}
            nhlTeamByAbbr={nhlTeamByAbbr}
            className={
              shiftBottomTeams && teamIndex === 4 ? "col-start-2" : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}

function CompactBestAvailableTable({
  title,
  players,
}: {
  title: string;
  players: DraftHubEligiblePlayerView[];
}) {
  const isGoalieTable = players.some((player) => player.posGroup === "G");
  const statColumns = isGoalieTable
    ? ([
        ["GP", "GP"],
        ["W", "W"],
        ["GAA", "GAA"],
        ["SVP", "SV%"],
      ] as const)
    : ([
        ["GP", "GP"],
        ["G", "G"],
        ["A", "A"],
        ["P", "P"],
        ["PM", "+/-"],
        ["PIM", "PIM"],
        ["PPP", "PPP"],
        ["SOG", "SOG"],
        ["HIT", "HIT"],
        ["BLK", "BLK"],
      ] as const);

  return (
    <section className="min-h-0 overflow-x-auto">
      <div className="flex h-4 items-center justify-between bg-slate-100 px-1.5">
        <h3 className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-800">
          {title}
        </h3>
        <span className="text-[9px] font-semibold text-slate-500">
          Best available
        </span>
      </div>
      <table className="w-full table-auto text-[9px] leading-[9px]">
        <thead className="border-y border-slate-200 bg-white text-[8px] uppercase leading-[9px] text-slate-500">
          <tr>
            <th className="min-w-6 px-0.5 py-px text-right">RK</th>
            <th className="min-w-5 px-0.5 py-px" aria-label="NHL team" />
            <th className="whitespace-nowrap px-0.5 py-px text-left">Player</th>
            <th className="min-w-9 whitespace-nowrap px-0.5 py-px">Pos</th>
            <th className="min-w-8 px-0.5 py-px text-right">OVR</th>
            {statColumns.map(([, label]) => (
              <th
                key={label}
                className={cn(
                  "px-px py-px text-right",
                  isGoalieTable ? "min-w-7" : "min-w-6",
                )}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr
              key={player.id}
              className="border-b border-slate-100 last:border-b-0"
            >
              <td className="px-px py-px text-right align-top tabular-nums text-slate-500">
                {player.overallRk ?? "--"}
              </td>
              <td className="px-px py-px align-top">
                <NHLLogo
                  team={
                    player.nhlTeamLogoUrl
                      ? {
                          name: getPlayerNhlAbbreviation(player) ?? "NHL team",
                          logoUrl: player.nhlTeamLogoUrl,
                        }
                      : undefined
                  }
                  size={11}
                />
              </td>
              <td
                className="whitespace-nowrap px-0.5 py-px align-top font-semibold leading-[10px] text-slate-900"
                title={player.fullName}
              >
                {player.fullName}
              </td>
              <td className="whitespace-nowrap px-px py-px text-center align-top leading-[10px] text-slate-500">
                {player.nhlPos.join("/")}
              </td>
              <td className="px-px py-px text-right align-top font-bold tabular-nums text-slate-800">
                {typeof player.overallRating === "number"
                  ? formatNumber(player.overallRating, 2)
                  : "--"}
              </td>
              {statColumns.map(([key]) => (
                <td
                  key={key}
                  className="px-px py-px text-right align-top tabular-nums text-slate-600"
                >
                  {formatUfaStat(player.stats, key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CompactBestAvailable({
  players,
}: {
  players: DraftHubEligiblePlayerView[];
}) {
  const skaters = players
    .filter((player) => player.posGroup !== "G")
    .slice(0, 26);
  const goalies = players
    .filter((player) => player.posGroup === "G")
    .slice(0, 8);

  return (
    <aside
      className="absolute bottom-1.5 left-1/2 z-10 flex h-[calc((100%_-_58px)/2)] w-[calc(25%_+_3px)] -translate-x-1/2 flex-col overflow-y-auto overflow-x-hidden rounded-lg border border-slate-300 bg-white shadow-md"
      aria-label="Best available players"
    >
      <CompactBestAvailableTable title="Top 26 skaters" players={skaters} />
      <div className="mt-auto border-t border-slate-300">
        <CompactBestAvailableTable title="Top 8 goalies" players={goalies} />
      </div>
    </aside>
  );
}

export function DraftRosterBoard() {
  const board = useDraftRosterBoard();
  const draftYear = board.season ? getDraftYear(board.season) : null;
  const nhlTeamByAbbr = new Map(
    board.nhlTeams.map((team) => [team.abbr.trim().toUpperCase(), team]),
  );

  return (
    <>
      <div className="grid min-h-screen place-items-center bg-white px-6 text-center text-slate-900 xl:hidden">
        <div>
          <MonitorUp className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-4 text-[25px] font-black">
            Desktop display required
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            Open this roster board on a screen at least 1280px wide.
          </p>
        </div>
      </div>

      <main className="hidden h-screen min-h-[700px] flex-col overflow-hidden bg-white p-2 text-slate-950 xl:flex">
        <header className="mb-2 flex h-12 shrink-0 items-center justify-between rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
              {draftYear ? `${draftYear} GSHL Draft` : "GSHL Draft"}
            </p>
            <h1 className="text-[21px] font-black leading-tight">
              League Roster Board
            </h1>
          </div>
          <p className="text-right text-[13px] text-muted-foreground">
            {board.season?.name ?? "Current draft season"}
            <br />
            {board.conferences.reduce(
              (total, conference) => total + conference.teams.length,
              0,
            )}{" "}
            current rosters
          </p>
        </header>

        {board.isLoading ? (
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
            {[0, 1].map((conference) => (
              <div
                key={conference}
                className="animate-pulse rounded-xl border border-slate-200 bg-slate-100"
              />
            ))}
          </div>
        ) : board.conferences.length ? (
          <div className="relative grid min-h-0 flex-1 grid-cols-2 gap-2">
            {board.conferences.map((conference) => (
              <ConferenceRosterCard
                key={conference.id}
                conference={conference}
                players={board.players}
                nhlTeamByAbbr={nhlTeamByAbbr}
                shiftBottomTeams={conference === board.conferences[1]}
              />
            ))}
            {board.conferences.length >= 2 ? (
              <CompactBestAvailable players={board.availablePlayers} />
            ) : null}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center rounded-xl border border-dashed border-slate-300 text-muted-foreground">
            No current conference rosters are available.
          </div>
        )}
      </main>
    </>
  );
}

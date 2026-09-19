"use client";

import Image from "next/image";
import { MonitorUp } from "lucide-react";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { useDraftRosterBoard } from "@gshl-hooks";
import { DraftRosterCenter } from "./DraftRosterCenter";
import { formatDraftPickLabel } from "@gshl-utils/features/draft-tv";
import { useDraftBoardFit } from "@gshl-hooks/features/useDraftBoardFit";
import {
  abbreviatePlayerName,
  buildCurrentRoster,
  buildTeamLineup,
  cn,
  formatNumber,
  formatUfaStat,
  getBenchPlayers,
  getPlayerNhlAbbreviation,
  getRosterRatingClass,
} from "@gshl-utils";
import type {
  DraftHubEligiblePlayerView,
  DraftPick,
  DraftRosterConferenceView,
  DraftRosterTeamView,
  NHLTeam,
  Player,
} from "@gshl-types";

function RosterPlayer({
  player,
  nhlTeamByAbbr,
  muted = false,
}: {
  player: Player;
  nhlTeamByAbbr: Map<string, NHLTeam>;
  muted?: boolean;
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
      className={cn(
        "min-w-0 rounded border border-slate-300/70 px-1 py-0.5 text-center",
        muted ? "bg-slate-200/60" : "bg-white shadow-sm",
      )}
      title={`${abbreviatePlayerName(player.fullName)} · ${player.nhlPos.join("/")} · ${rating}`}
    >
      <p
        aria-label={player.fullName}
        className={cn(
          "whitespace-normal text-[0.9em] leading-tight text-slate-900",
          muted ? "font-medium" : "font-bold",
        )}
      >
        {abbreviatePlayerName(player.fullName)}
      </p>
      <div className="mt-0.5 flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5">
        <NHLLogo
          team={nhlTeam}
          size={18}
          className="!h-[1.05em] !w-[1.05em] shrink-0"
        />
        <span className="break-words text-[0.72em] leading-tight text-slate-600">
          {player.nhlPos.join("/")}
        </span>
        <span
          className={cn(
            "rounded px-0.5 text-[0.75em] leading-tight text-slate-800",
            muted ? "font-medium" : "font-bold",
            getRosterRatingClass(player.seasonRk),
          )}
        >
          {rating}
        </span>
      </div>
    </div>
  );
}

export function TeamRosterCard({
  team,
  players,
  nhlTeamByAbbr,
  className,
  muted = false,
  remainingPicks,
}: {
  team: DraftRosterTeamView;
  players: Player[];
  nhlTeamByAbbr: Map<string, NHLTeam>;
  className?: string;
  muted?: boolean;
  remainingPicks?: readonly DraftPick[];
}) {
  const { panelRef, contentRef } = useDraftBoardFit();
  const roster = buildCurrentRoster(players, team);
  const lineup = buildTeamLineup(roster);
  const bench = getBenchPlayers(roster);

  return (
    <article
      ref={panelRef}
      aria-label={`${team.name ?? team.abbr ?? "Team"} roster`}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-700",
        muted ? "bg-slate-100" : "bg-white",
        className,
      )}
    >
      <div ref={contentRef} className="w-full shrink-0">
        <header
          className={cn(
            "flex min-h-8 shrink-0 items-center gap-1 border-b border-slate-300 px-1.5 py-0.5",
            muted ? "bg-slate-200/80" : "bg-slate-50",
          )}
        >
          {team.logoUrl ? (
            <Image
              src={team.logoUrl}
              alt={`${team.name ?? team.abbr ?? "Team"} logo`}
              width={24}
              height={24}
              className="h-[1.65em] w-[1.65em] shrink-0 object-contain"
            />
          ) : (
            <div className="grid h-[1.65em] w-[1.65em] shrink-0 place-items-center rounded-full bg-slate-200 text-[0.75em] font-bold">
              {team.abbr ?? "?"}
            </div>
          )}
          <div className="min-w-0">
            <h3
              className={cn(
                "whitespace-normal break-words text-[0.96em] leading-tight text-slate-950",
                muted ? "font-semibold" : "font-black",
              )}
            >
              {team.name ?? team.abbr ?? "Team"}
            </h3>
            <p className="text-[0.76em] leading-tight text-slate-600">
              {roster.length} players
            </p>
          </div>
          <div
            className="ml-auto shrink-0 text-right"
            title="Live talent rating across 15 weighted roster slots. Empty slots count as zero; primary starters count most, followed by secondary starters and goalie, utility, then bench."
          >
            <p className="text-[0.68em] font-medium uppercase tracking-wide text-slate-600">
              Talent
            </p>
            <p
              className={cn(
                "text-[0.96em] tabular-nums text-primary",
                muted ? "font-medium" : "font-black",
              )}
            >
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
                        muted={muted}
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
              <p className="mb-0.5 text-[0.8em] font-bold uppercase tracking-wider text-slate-600">
                Bench
              </p>
              <div className="grid grid-cols-2 gap-0.5">
                {bench.map((player) => (
                  <RosterPlayer
                    key={player.id}
                    player={player}
                    muted={muted}
                    nhlTeamByAbbr={nhlTeamByAbbr}
                  />
                ))}
              </div>
            </section>
          ) : null}
          {remainingPicks && remainingPicks.length > 0 && (
            <section
              aria-label="Remaining draft picks"
              className="border-t border-slate-300 pt-1"
            >
              <p className="mb-1 text-[0.75em] font-medium uppercase tracking-wide text-slate-600">
                Draft picks &middot; {remainingPicks.length}
              </p>
              <div
                className="grid grid-flow-col grid-cols-3 gap-x-1 gap-y-0.5 text-center text-[0.78em] tabular-nums text-slate-700"
                style={{
                  gridTemplateRows: `repeat(${Math.ceil(remainingPicks.length / 3)}, minmax(0, auto))`,
                }}
              >
                {remainingPicks.map((pick) => (
                  <span
                    key={pick.id}
                    data-remaining-pick-id={pick.id}
                    title={`Round ${pick.round}, overall ${pick.pick}`}
                  >
                    {formatDraftPickLabel(pick)}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}

function ConferenceRosterCard({
  conference,
  players,
  nhlTeamByAbbr,
  shiftBottomTeams,
  remainingPicksByFranchise,
}: {
  conference: DraftRosterConferenceView;
  players: Player[];
  nhlTeamByAbbr: Map<string, NHLTeam>;
  shiftBottomTeams: boolean;
  remainingPicksByFranchise: Map<string, DraftPick[]>;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-300 bg-slate-200 p-1.5">
      <header className="mb-1 flex h-[2.25em] shrink-0 items-center justify-center gap-2 rounded-lg border-b border-slate-300 bg-slate-200 text-slate-900">
        {conference.logoUrl ? (
          <Image
            src={conference.logoUrl}
            alt={`${conference.name} logo`}
            width={24}
            height={24}
            className="h-[1.5em] w-[1.5em] object-contain"
          />
        ) : null}
        <h2 className="text-[1.25em] font-semibold uppercase tracking-[0.14em]">
          {conference.name}
        </h2>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-2 gap-1.5">
        {conference.teams.map((team, teamIndex) => (
          <TeamRosterCard
            key={team.id}
            team={team}
            remainingPicks={remainingPicksByFranchise.get(team.franchiseId)}
            muted
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

export function CompactBestAvailableTable({
  title,
  players,
  broadcast = false,
}: {
  title: string;
  players: DraftHubEligiblePlayerView[];
  broadcast?: boolean;
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
    <section className="min-h-0" aria-label={`${title} statistics`}>
      <div
        className={cn(
          "flex min-h-[1.8em] items-center justify-between px-1.5",
          broadcast
            ? "border-l-4 border-amber-400 bg-slate-200/80 text-slate-900"
            : "bg-slate-100",
        )}
      >
        <h3
          className={cn(
            "text-[0.9em] uppercase tracking-[0.08em] text-slate-800",
            broadcast ? "font-semibold" : "font-black",
          )}
        >
          {title}
        </h3>
        <span
          className={cn(
            "font-semibold",
            broadcast
              ? "text-[0.6em] uppercase tracking-widest text-slate-600"
              : "text-[0.9em] text-slate-600",
          )}
        >
          {broadcast ? "Ranked by OVR" : "Best available"}
        </span>
      </div>
      <table className="w-full table-auto text-[0.9em] leading-snug">
        <thead
          className={cn(
            "border-y border-slate-300 text-[1em] uppercase leading-tight text-slate-600",
            broadcast ? "bg-slate-200" : "bg-slate-100",
          )}
        >
          <tr>
            <th className="px-0.5 py-0 text-right">RK</th>
            <th className="px-0.5 py-0" aria-label="NHL team" />
            <th className="whitespace-nowrap px-0.5 py-0 text-left">Player</th>
            <th className="whitespace-nowrap px-0.5 py-0">Pos</th>
            <th
              className={cn(
                "px-0.5 py-0 text-right",
                broadcast && "bg-amber-100/60 text-slate-900",
              )}
            >
              OVR
            </th>
            {statColumns.map(([, label]) => (
              <th key={label} className="px-px py-0 text-right">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player, index) => (
            <tr
              key={player.id}
              className={cn(
                "border-b border-slate-200 last:border-b-0",
                broadcast && index < 3
                  ? "bg-amber-100/30"
                  : broadcast
                    ? "odd:bg-slate-100 even:bg-slate-200/60"
                    : "odd:bg-white even:bg-slate-50",
              )}
            >
              <td
                className={cn(
                  "px-px py-0 text-right align-top tabular-nums",
                  broadcast && index < 3
                    ? "border-l-4 border-amber-400 font-bold text-slate-900"
                    : "text-slate-600",
                )}
              >
                {player.overallRk ?? "--"}
              </td>
              <td className="px-px py-0 align-top">
                <NHLLogo
                  team={
                    player.nhlTeamLogoUrl
                      ? {
                          name: getPlayerNhlAbbreviation(player) ?? "NHL team",
                          logoUrl: player.nhlTeamLogoUrl,
                        }
                      : undefined
                  }
                  size={18}
                  className="!h-[1.2em] !w-[1.2em]"
                />
              </td>
              <td
                className="whitespace-nowrap bg-inherit px-0.5 py-0 align-top font-semibold leading-tight text-slate-900"
                title={player.fullName}
                aria-label={player.fullName}
              >
                {abbreviatePlayerName(player.fullName)}
              </td>
              <td className="whitespace-nowrap px-px py-0 text-center align-top leading-tight text-slate-600">
                {player.nhlPos.join("/")}
              </td>
              <td
                className={cn(
                  "px-px py-0 text-right align-top font-bold tabular-nums text-slate-800",
                  broadcast && "bg-amber-100/40",
                )}
              >
                {typeof player.overallRating === "number"
                  ? formatNumber(player.overallRating, 2)
                  : "--"}
              </td>
              {statColumns.map(([key]) => (
                <td
                  key={key}
                  className="px-px py-0 text-right align-top tabular-nums text-slate-600"
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

export function DraftRosterBoard() {
  const board = useDraftRosterBoard();
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

      <main className="hidden h-dvh min-h-[700px] flex-col overflow-hidden bg-slate-200 p-2 text-[length:clamp(13px,0.833vw,32px)] leading-tight text-slate-950 xl:flex">
        <h1 className="sr-only">Draft roster overview</h1>

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
                remainingPicksByFranchise={board.remainingPicksByFranchise}
                nhlTeamByAbbr={nhlTeamByAbbr}
                shiftBottomTeams={conference === board.conferences[1]}
              />
            ))}
            {board.conferences.length >= 2 ? (
              <DraftRosterCenter
                teams={board.conferences.flatMap(
                  (conference) => conference.teams,
                )}
              />
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

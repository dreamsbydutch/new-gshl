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
  getBenchPlayers,
  getDraftYear,
  getPlayerNhlAbbreviation,
  getRosterRatingClass,
} from "@gshl-utils";
import type {
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
      <p className="truncate text-[9px] font-bold leading-tight text-slate-900">
        {player.fullName}
      </p>
      <div className="mt-0.5 flex items-center justify-center gap-1">
        <NHLLogo team={nhlTeam} size={11} />
        <span className="text-[8px] leading-none text-slate-500">
          {player.nhlPos.join("/")}
        </span>
        <span
          className={cn(
            "rounded px-1 text-[8px] font-bold leading-3 text-slate-800",
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
}: {
  team: DraftRosterTeamView;
  players: Player[];
  nhlTeamByAbbr: Map<string, NHLTeam>;
}) {
  const roster = buildCurrentRoster(players, team);
  const lineup = buildTeamLineup(roster);
  const bench = getBenchPlayers(roster);

  return (
    <article className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="flex h-9 shrink-0 items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-1.5">
        {team.logoUrl ? (
          <Image
            src={team.logoUrl}
            alt={`${team.name ?? team.abbr ?? "Team"} logo`}
            width={24}
            height={24}
            className="h-6 w-6 shrink-0 object-contain"
          />
        ) : (
          <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-200 text-[8px] font-bold">
            {team.abbr ?? "?"}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-[10px] font-black leading-tight text-slate-950">
            {team.name ?? team.abbr ?? "Team"}
          </h3>
          <p className="text-[8px] leading-none text-slate-500">
            {roster.length} players
          </p>
        </div>
        <div
          className="ml-auto shrink-0 text-right"
          title="Live talent rating. Starting players count twice as much as bench players."
        >
          <p className="text-[7px] font-bold uppercase tracking-wide text-slate-500">
            Talent
          </p>
          <p className="text-[10px] font-black tabular-nums text-primary">
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
            <p className="mb-0.5 text-[7px] font-bold uppercase tracking-wider text-slate-500">
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
}: {
  conference: DraftRosterConferenceView;
  players: Player[];
  nhlTeamByAbbr: Map<string, NHLTeam>;
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
        <h2 className="text-sm font-black uppercase tracking-[0.14em]">
          {conference.name}
        </h2>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-2 gap-1.5">
        {conference.teams.map((team) => (
          <TeamRosterCard
            key={team.id}
            team={team}
            players={players}
            nhlTeamByAbbr={nhlTeamByAbbr}
          />
        ))}
      </div>
    </section>
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
          <h1 className="mt-4 text-2xl font-black">Desktop display required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Open this roster board on a screen at least 1280px wide.
          </p>
        </div>
      </div>

      <main className="hidden h-screen min-h-[700px] flex-col overflow-hidden bg-white p-2 text-slate-950 xl:flex">
        <header className="mb-2 flex h-12 shrink-0 items-center justify-between rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-primary">
              {draftYear ? `${draftYear} GSHL Draft` : "GSHL Draft"}
            </p>
            <h1 className="text-xl font-black leading-tight">
              League Roster Board
            </h1>
          </div>
          <p className="text-right text-xs text-muted-foreground">
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
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
            {board.conferences.map((conference) => (
              <ConferenceRosterCard
                key={conference.id}
                conference={conference}
                players={board.players}
                nhlTeamByAbbr={nhlTeamByAbbr}
              />
            ))}
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

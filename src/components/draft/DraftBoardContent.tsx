"use client";

import { DraftBoardList } from "@gshl-components/draft/DraftBoardList";
import {
  useAllContracts,
  useDraftPicks,
  usePlayers,
  useTeams,
  useSeasonState,
} from "@gshl-hooks";
import type { Contract, GSHLTeam, Player } from "@gshl-types";
import { cn, resolveContractDefaultSeason } from "@gshl-utils";
import Image from "next/image";
import { TeamRoster } from "@gshl-components/team/TeamRoster";
import { DraftBoardSkeleton } from "@gshl-skeletons";

export function DraftBoardContent() {
  const {
    defaultSeason,
    seasons,
    isLoading: seasonsLoading,
  } = useSeasonState();
  const contractSeason = resolveContractDefaultSeason(seasons) ?? defaultSeason;
  const seasonId = contractSeason?.id ? String(contractSeason.id) : undefined;
  const { data: contractsData, isLoading: contractsLoading } =
    useAllContracts();
  const contracts: Contract[] = contractsData ?? [];
  const { data: players, isLoading: playersLoading } = usePlayers();
  const { data: teamsRaw = [], isLoading: teamsLoading } = useTeams({
    seasonId,
    enabled: Boolean(seasonId),
  });
  const teams = teamsRaw as GSHLTeam[];
  const { data: draftPicks, isLoading: draftPicksLoading } = useDraftPicks();

  const isLoading =
    seasonsLoading ||
    contractsLoading ||
    playersLoading ||
    teamsLoading ||
    draftPicksLoading;

  if (isLoading || !seasonId) {
    return <DraftBoardSkeleton />;
  }

  const activeDraftPicks = draftPicks
    ?.filter((a) => a.seasonId === seasonId && a.playerId === null)
    .sort((a, b) => +a.pick - +b.pick)
    .slice(0, 8);
  const teamList = teams ?? [];
  const playerList = players ?? [];
  const inpersonId = ["174", "175", "176", "177", "184", "171", "172"];
  return (
    <div className="mt-20 flex flex-row gap-1">
      <div className="w-[425px]">
        <div className="mb-6 flex flex-col items-center justify-between">
          <div className="my-2 space-y-2 text-center text-sm text-muted-foreground">
            {activeDraftPicks?.map((pick, i) => {
              const team = teams?.find((t) => t.id === pick.gshlTeamId);
              return (
                <div
                  key={pick.id}
                  className={cn(
                    "text-sm",
                    i === 0
                      ? "rounded-md border bg-green-100 p-2 text-base font-semibold text-black shadow-lg"
                      : i === 1
                        ? "rounded-md border bg-green-50 p-1 text-base text-black shadow-sm"
                        : i === 2
                          ? "rounded-md border p-1 text-sm text-black shadow-sm"
                          : "",
                  )}
                >
                  Round {pick.round}, Pick {pick.pick} -{" "}
                  {team?.logoUrl ? (
                    <Image
                      src={team.logoUrl}
                      alt={team?.name ?? ""}
                      width={16}
                      height={16}
                      className="mr-1 inline-block h-4 w-4"
                    />
                  ) : (
                    <div className="mr-1 inline-block h-4 w-4 rounded bg-gray-200" />
                  )}{" "}
                  {team?.name}
                </div>
              );
            })}
          </div>
        </div>
        <DraftBoardList seasonId={seasonId} navbarToggle />
      </div>
      <div className="flex flex-col gap-8">
        <div className="flex flex-row flex-wrap items-center justify-center gap-2 rounded-lg bg-gray-50 bg-opacity-25 p-1 shadow-md">
          {teamList
            .filter((t) => inpersonId.includes(t.id))
            .map((team) => (
              <div key={team.id}>
                <DraftBoardRoster
                  key={team.id}
                  players={playerList.filter(
                    (player) => player.ownerId === team.ownerId,
                  )}
                  contracts={contracts.filter(
                    (contract) => contract.ownerId === team.ownerId,
                  )}
                  currentTeam={team}
                />
              </div>
            ))}
        </div>
        <div className="flex flex-row flex-wrap items-center justify-center gap-2 rounded-lg bg-sunview-50 bg-opacity-25 p-1 shadow-md">
          {teamList
            .filter((t) => t.confAbbr === "SV")
            .map((team) => (
              <div key={team.id}>
                <DraftBoardRoster
                  key={team.id}
                  players={playerList.filter(
                    (player) => player.ownerId === team.ownerId,
                  )}
                  contracts={contracts.filter(
                    (contract) => contract.ownerId === team.ownerId,
                  )}
                  currentTeam={team}
                />
              </div>
            ))}
        </div>
        <div className="flex flex-row flex-wrap items-center justify-center gap-2 rounded-lg bg-hotel-50 bg-opacity-25 p-1 shadow-md">
          {teamList
            .filter((t) => t.confAbbr === "HH")
            .map((team) => (
              <div key={team.id}>
                <DraftBoardRoster
                  key={team.id}
                  players={playerList.filter(
                    (player) => player.ownerId === team.ownerId,
                  )}
                  contracts={contracts.filter(
                    (contract) => contract.ownerId === team.ownerId,
                  )}
                  currentTeam={team}
                />
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function DraftBoardRoster({
  players,
  contracts,
  currentTeam,
}: {
  players: Player[] | undefined;
  contracts: Contract[];
  currentTeam: GSHLTeam;
}) {
  const showSalaries = false;

  return (
    <>
      <div className="mx-2 text-center text-xl font-bold">
        {currentTeam.logoUrl ? (
          <Image
            src={currentTeam.logoUrl}
            alt={currentTeam.name ?? "Team logo"}
            width={50}
            height={50}
            className="mx-auto mb-1"
          />
        ) : (
          <div className="mx-auto mb-1 h-[50px] w-[50px]" aria-hidden="true" />
        )}
        {currentTeam.name} Roster
      </div>
      <TeamRoster
        players={players}
        contracts={contracts}
        currentTeam={currentTeam}
        showSalaries={showSalaries}
      />
    </>
  );
}

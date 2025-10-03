import Image from "next/image";
import { NHLLogo } from "../../ui/nhlLogo";
import { formatNumber } from "@gshl-utils";
import { HorizontalToggle, TertiaryPageToolbar } from "@gshl-nav";
import type { ToggleItem, DraftPick, NHLTeam, GSHLTeam } from "@gshl-types";
import type {
  DraftBoardToolbarProps,
  DraftBoardPlayer,
} from "@gshl-utils/draft-board-list";
import {
  lighten,
  readableText,
  useTeamColor,
} from "@gshl-hooks";

function MockDraftPickCard({
  pick,
  index,
  draftPlayers,
  nhlTeams,
  gshlTeam,
}: {
  pick: DraftPick;
  index: number;
  draftPlayers: DraftBoardPlayer[];
  nhlTeams: NHLTeam[];
  gshlTeam: GSHLTeam | undefined;
}) {
  const projectedPlayer: DraftBoardPlayer | undefined = draftPlayers[index];
  const teamColor = useTeamColor(gshlTeam?.logoUrl);
  const base = teamColor ? lighten(teamColor, 0.82) : "#f1f5f9"; // lightened background
  const accent = teamColor ?? "#cbd5e1"; // border uses original or neutral
  // Determine readable text against the actual background (base), not the original team color
  const textColor = readableText(base);
  return (
    <div
      className="w-[350px] rounded-md border p-0.5 shadow-sm transition-colors"
      style={{ backgroundColor: base, borderColor: accent }}
    >
      <div
        className="ml-4 flex flex-row items-center gap-2 font-varela font-semibold"
        style={{ color: textColor }}
      >
        {gshlTeam?.logoUrl ? (
          <Image
            className="shrink-0 rounded-sm ring-1 ring-white/40"
            src={gshlTeam.logoUrl}
            alt={gshlTeam?.name ?? ""}
            width={32}
            height={32}
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-gray-200 ring-1 ring-white/40">
            <span className="text-xs text-gray-400">?</span>
          </div>
        )}
        <span className="text-lg">{gshlTeam?.name}</span>
        <span className="text-xs font-normal opacity-70">
          Rd {pick.round}, Pk {pick.pick}
        </span>
      </div>
      <div
        className="rounded p-0.5 text-[11px] leading-tight"
        style={{ color: textColor }}
      >
        {projectedPlayer ? (
          <div className="mx-auto flex max-w-[250px] flex-row items-center">
            <NHLLogo
              size={24}
              team={nhlTeams.find(
                (t: NHLTeam) =>
                  t.abbreviation === projectedPlayer.nhlTeam.toString(),
              )}
            />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[13px] font-semibold md:text-sm">
                {projectedPlayer.fullName}
              </span>
              <span className="text-center text-[10px] opacity-75">
                {projectedPlayer.nhlPos.toString()} • Age {projectedPlayer.age}
              </span>
            </div>
            <div className="ml-auto flex flex-col items-end gap-0.5 text-[10px]">
              <span>
                24-25{" "}
                {(+formatNumber(projectedPlayer.seasonRating ?? 0, 2)).toFixed(
                  2,
                )}{" "}
                (#{projectedPlayer.seasonRk})
              </span>
              <span>
                Ovr{" "}
                {(+formatNumber(projectedPlayer.overallRating ?? 0, 2)).toFixed(
                  2,
                )}{" "}
                (#{projectedPlayer.overallRk})
              </span>
            </div>
          </div>
        ) : (
          <div className="text-[10px] italic opacity-70">
            No projected player for this pick.
          </div>
        )}
      </div>
    </div>
  );
}

export function MockDraftList({
  seasonDraftPicks,
  draftPlayers,
  nhlTeams,
  gshlTeams,
  toolbarProps,
}: {
  seasonDraftPicks: DraftPick[];
  draftPlayers: DraftBoardPlayer[];
  nhlTeams: NHLTeam[];
  gshlTeams: GSHLTeam[];
  toolbarProps?: DraftBoardToolbarProps;
}) {
  return (
    <div className="mt-8 text-center">
      <h2 className="mb-4 text-2xl font-bold">GSHL Mock Draft</h2>
      <div className="flex flex-col gap-1">
        {seasonDraftPicks.map((dp: DraftPick, i: number) => {
          const gshlTeam = gshlTeams.find(
            (team: GSHLTeam) => team.id === dp.gshlTeamId,
          );
          const showRoundHeader =
            i === 0 || seasonDraftPicks[i - 1]?.round !== dp.round;
          return (
            <div key={dp.id} className="flex flex-col items-center gap-1">
              {showRoundHeader && (
                <div className="mt-4 flex items-center gap-2">
                  <div className="h-px flex-1 bg-gray-300" />
                  <span className="m-2 text-lg font-semibold uppercase tracking-wide text-gray-600">
                    Round {dp.round}
                  </span>
                  <div className="h-px flex-1 bg-gray-300" />
                </div>
              )}
              <MockDraftPickCard
                pick={dp}
                index={i}
                draftPlayers={draftPlayers}
                nhlTeams={nhlTeams}
                gshlTeam={gshlTeam}
              />
            </div>
          );
        })}
      </div>
      {toolbarProps && (
        <TertiaryPageToolbar>
          <HorizontalToggle<ToggleItem<string | null>>
            items={toolbarProps.toolbarKeys}
            selectedItem={
              toolbarProps.toolbarKeys.find(
                (item) => item.key === toolbarProps.activeKey,
              ) ?? null
            }
            onSelect={(type: ToggleItem<string | null>) =>
              type.setter(type.key)
            }
            getItemKey={(type: ToggleItem<string | null>) => type.key}
            getItemLabel={(type: ToggleItem<string | null>) => type.value}
            itemClassName="text-sm text-nowrap"
            className="no-scrollbar flex flex-row overflow-scroll"
          />
        </TertiaryPageToolbar>
      )}
    </div>
  );
}

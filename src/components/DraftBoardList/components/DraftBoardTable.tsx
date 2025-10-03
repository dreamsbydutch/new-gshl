import { Table } from "@gshl-ui";
import { NHLLogo } from "../../ui/nhlLogo";
import { HorizontalToggle, SecondaryPageToolbar } from "@gshl-nav";
import type { ToggleItem, NHLTeam } from "@gshl-types";
import type {
  DraftBoardPlayer,
  DraftBoardToolbarProps,
} from "@gshl-utils/draft-board-list";
import { useState } from "react";

export function DraftBoardTable({
  draftPlayers,
  nhlTeams,
  toolbarProps,
}: {
  draftPlayers: DraftBoardPlayer[];
  totalCount: number;
  nhlTeams: NHLTeam[];
  toolbarProps: DraftBoardToolbarProps;
}) {
  return (
    <div className="mt-8">
      <h2 className="mb-1 text-center text-xl font-semibold">
        Best Available{" "}
        {toolbarProps.activeKey === "all"
          ? "Players"
          : toolbarProps.activeKey === "forward"
            ? "Forwards"
            : toolbarProps.activeKey === "center"
              ? "Centers"
              : toolbarProps.activeKey === "leftwing"
                ? "Left Wings"
                : toolbarProps.activeKey === "rightwing"
                  ? "Right Wings"
                  : toolbarProps.activeKey === "defense"
                    ? "Defensemen"
                    : toolbarProps.activeKey === "goalie"
                      ? "Goalies"
                      : toolbarProps.activeKey === "wildcard"
                        ? "Wildcard"
                        : ""}
      </h2>
      <Table className="divide-y divide-gray-200 text-center">
        <thead>
          <tr>
            <th>Ovr Rk</th>
            <th>Tm</th>
            <th>Player</th>
            <th>Pos</th>
            <th>Hd</th>
            <th>Age</th>
            <th>Ht</th>
            <th>Wt</th>
            <th className="min-w-20">2024-25 Rating</th>
            <th>Overall Rating</th>
          </tr>
        </thead>
        <tbody>
          {draftPlayers.map((player: DraftBoardPlayer) => (
            <DraftBoardPlayerListing
              key={player.id}
              player={player}
              nhlTeams={nhlTeams}
            />
          ))}
        </tbody>
      </Table>
      <SecondaryPageToolbar>
        <HorizontalToggle<ToggleItem<string | null>>
          items={toolbarProps.toolbarKeys}
          selectedItem={
            toolbarProps.toolbarKeys.find(
              (item: ToggleItem<string | null>) =>
                item.key === toolbarProps.activeKey,
            ) ?? null
          }
          onSelect={(type: ToggleItem<string | null>) => type.setter(type.key)}
          getItemKey={(type: ToggleItem<string | null>) => type.key}
          getItemLabel={(type: ToggleItem<string | null>) => type.value}
          itemClassName="text-sm text-nowrap"
          className="no-scrollbar flex flex-row overflow-scroll"
        />
      </SecondaryPageToolbar>
    </div>
  );
}

function DraftBoardPlayerListing({
  player,
  nhlTeams,
}: {
  player: DraftBoardPlayer;
  nhlTeams: NHLTeam[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <tr key={player.id} className="py-2" onClick={() => setIsOpen(!isOpen)}>
      <td className="whitespace-nowrap px-1">{player.overallRk}</td>
      <td>
        <NHLLogo
          team={nhlTeams.find(
            (t: NHLTeam) => t.abbreviation === player.nhlTeam.toString(),
          )}
        />
      </td>
      <td className="whitespace-nowrap px-2">{player.fullName}</td>
      <td className="whitespace-nowrap px-2">{player.nhlPos.join(", ")}</td>
      <td className="whitespace-nowrap px-2">{player.handedness}</td>
      <td className="whitespace-nowrap px-2">
        {player.birthday
          ? Math.floor(
              (Date.now() - new Date(player.birthday).getTime()) /
                (365.25 * 24 * 60 * 60 * 1000),
            )
          : "N/A"}
      </td>
      <td className="whitespace-nowrap px-2">{player.height}</td>
      <td className="whitespace-nowrap px-2">{player.weight}</td>
      <td className="whitespace-nowrap px-2">
        {(+(player.seasonRating ?? 0)).toFixed(2)}
      </td>
      <td className="whitespace-nowrap px-2">
        {(+(player.overallRating ?? 0)).toFixed(2)}
      </td>
    </tr>
  );
}

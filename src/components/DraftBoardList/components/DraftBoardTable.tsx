import { Table } from "@gshl-ui";
import { NHLLogo } from "../../ui/nhlLogo";
import { HorizontalToggle, TertiaryPageToolbar } from "@gshl-nav";
import type { ToggleItem, NHLTeam } from "@gshl-types";
import type { DraftBoardPlayer, DraftBoardToolbarProps } from "../utils/index";

export function DraftBoardTable({
  draftPlayers,
  totalCount,
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
      <h2 className="mb-2 text-2xl font-bold">Draft Board</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Showing {draftPlayers.length} of {totalCount} players (active signable +
        active non-signable UFAs).
      </p>
      <Table className="divide-y divide-gray-200 text-center">
        <thead>
          <tr>
            <th>Pick</th>
            <th>Tm</th>
            <th>Player</th>
            <th>Pos</th>
            <th>Age</th>
            <th>2024-25 Rating</th>
            <th>Overall Rating</th>
          </tr>
        </thead>
        <tbody>
          {draftPlayers.map((player: DraftBoardPlayer) => (
            <tr key={player.id} className="py-2">
              <td className="whitespace-nowrap">{player.overallRk}</td>
              <td>
                <NHLLogo
                  team={nhlTeams.find(
                    (t: NHLTeam) =>
                      t.abbreviation === player.nhlTeam.toString(),
                  )}
                />
              </td>
              <td className="whitespace-nowrap">{player.fullName}</td>
              <td className="whitespace-nowrap">{player.nhlPos.toString()}</td>
              <td className="whitespace-nowrap">{player.age}</td>
              <td className="whitespace-nowrap">
                {(+(player.seasonRating ?? 0).toFixed(2)).toFixed(2)}
              </td>
              <td className="whitespace-nowrap">
                {(+(player.overallRating ?? 0).toFixed(2)).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <TertiaryPageToolbar>
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
      </TertiaryPageToolbar>
    </div>
  );
}

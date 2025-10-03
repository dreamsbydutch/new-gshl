"use client";

import { DraftPickListSkeleton } from "@gshl-skeletons";
import { DraftPickItem } from "./components";
import { useTeamDraftPickListData } from "@gshl-hooks";
import type { TeamDraftPickListProps } from "@gshl-utils/team-draft-pick-list";
import type { Season } from "@gshl-types";
import { useEffect, useState } from "react";
import { DropdownToggle } from "../ui/nav/toggle";

/**
 * TeamDraftPickList orchestrator.
 * Responsibilities:
 * - Invoke derivation hook to build processed draft pick view models (availability, selected player, original team).
 * - Render a simple vertical list of `DraftPickItem` components.
 * - Display a skeleton while any required prop collections are incomplete.
 *
 * Assumptions / invariants:
 * - All input arrays (teams, draftPicks, contracts, players) are either fully loaded arrays or `undefined` during loading.
 * - No data fetching performed here; purely presentational orchestration.
 *
 * Key strategy:
 * - Uses stable key derived from `draftPick.id`; if duplicate ids ever occur (unexpected), falls back to composite round/pick pair.
 */
export function TeamDraftPickList({
  teams,
  allTeams,
  draftPicks,
  contracts,
  players,
  seasons, // optional: used to scope to next upcoming draft / historical selection
  gshlTeamId,
  selectedSeasonId,
}: TeamDraftPickListProps & { seasons?: Season[] }) {
  // Local (component-scoped) season selection so the toggle only affects this list.
  const [localSeasonId, setLocalSeasonId] = useState<string | undefined>(
    selectedSeasonId,
  );

  // If no explicit season provided, default to most recent season (by startDate)
  useEffect(() => {
    if (localSeasonId != null) return;
    if (!seasons?.length) return;
    const mostRecent = [...seasons].sort((a, b) => {
      const aTime = a.startDate instanceof Date ? a.startDate.getTime() : 0;
      const bTime = b.startDate instanceof Date ? b.startDate.getTime() : 0;
      return bTime - aTime;
    })[0];
    if (mostRecent) setLocalSeasonId(mostRecent.id);
  }, [seasons, localSeasonId]);

  const { processedDraftPicks, ready } = useTeamDraftPickListData(
    teams,
    draftPicks,
    contracts,
    players,
    seasons,
    gshlTeamId,
    localSeasonId,
    allTeams,
  );
  if (!ready) return <DraftPickListSkeleton />;

  return (
    <>
      <div className="mx-auto mt-4 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 py-3 text-xl font-bold">
          {seasons && seasons.length > 0 && localSeasonId != null && (
            <DropdownToggle
              items={[...seasons].sort((a, b) => {
                const aTime =
                  a.startDate instanceof Date ? a.startDate.getTime() : 0;
                const bTime =
                  b.startDate instanceof Date ? b.startDate.getTime() : 0;
                return bTime - aTime;
              })}
              selectedItem={seasons.find((s) => s.id === localSeasonId)}
              onSelect={(s: Season) => setLocalSeasonId(s.id)}
              getItemKey={(s: Season) => String(s.id)}
              getItemLabel={(s: Season) => s.name}
              className="min-w-28 bg-white text-base"
              dropdownPosition="auto"
            />
          )}
          <span>Draft Picks</span>
        </div>
      </div>
      {processedDraftPicks.length === 0 && (
        <div className="mt-2 text-center text-sm text-muted-foreground">
          No draft picks found.
        </div>
      )}
      {processedDraftPicks.map((processedPick) => {
        const { draftPick } = processedPick;
        const key = draftPick.id ?? `${draftPick.round}-${draftPick.pick}`;
        return (
          <DraftPickItem
            key={key}
            processedPick={processedPick}
            teams={teams!}
          />
        );
      })}
    </>
  );
}

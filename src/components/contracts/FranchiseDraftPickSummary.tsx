"use client";

import { formatDraftPickDescription } from "@gshl-utils";
import type { FranchiseDraftPickGroupType } from "@gshl-hooks/main/useContract";

export interface FranchiseDraftPickSummaryProps {
  groups: FranchiseDraftPickGroupType[];
  hasData: boolean;
}

export function FranchiseDraftPickSummary({
  groups,
  hasData,
}: FranchiseDraftPickSummaryProps) {
  return (
    <div className="mx-auto mb-8 w-full max-w-3xl">
      <div className="mt-4 w-full text-center text-lg font-bold">
        Draft Picks
      </div>

      {!hasData ? (
        <div className="mt-2 text-center text-sm text-muted-foreground">
          No draft picks found for the current or previous season.
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          {groups.map((group) => (
            <div key={group.seasonId} className="rounded-xl border bg-white">
              <div className="border-b px-4 py-2 text-center text-sm font-semibold">
                {group.seasonName}
              </div>
              {group.picks.length === 0 ? (
                <div className="px-4 py-3 text-center text-xs text-muted-foreground">
                  No picks tracked for this season.
                </div>
              ) : (
                <div className="divide-y">
                  {group.picks.map(({ draftPick, selectedPlayer, originalTeam }) => {
                    const originalTeamSuffix =
                      originalTeam?.name &&
                      String(originalTeam.id) !== String(draftPick.gshlTeamId)
                        ? ` (via ${originalTeam.name})`
                        : "";

                    return (
                      <div
                        key={draftPick.id}
                        className={
                          selectedPlayer
                            ? "px-4 py-2 text-center text-xs text-gray-400"
                            : "px-4 py-2 text-center text-xs text-gray-800"
                        }
                      >
                        {selectedPlayer
                          ? `${selectedPlayer.fullName}, ${selectedPlayer.nhlPos.toString()} (${formatDraftPickDescription(draftPick)}${originalTeamSuffix})`
                          : `${formatDraftPickDescription(draftPick)}${originalTeamSuffix}`}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { SecondaryPageToolbar } from "../nav/SecondaryToolbar";
import { useAppPathname, useAuthSession, useSeasonState } from "@gshl-hooks";
import { resolveDraftHubSeason } from "@gshl-utils";
import { DraftHubTeamToggle } from "./DraftHubTeamToggle";

export function DraftHubLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useAppPathname();
  const { session } = useAuthSession();
  const { seasons } = useSeasonState();
  const season = resolveDraftHubSeason(seasons);
  const showTeamToggle =
    pathname === "/draft/teams" || pathname.startsWith("/draft/teams/");

  return (
    <div className={showTeamToggle ? "pb-28 lg:pb-8 lg:pt-12" : ""}>
      {children}
      {showTeamToggle ? (
        <SecondaryPageToolbar>
          <DraftHubTeamToggle
            seasonId={season?.id}
            excludedOwnerId={session?.user.ownerId}
          />
        </SecondaryPageToolbar>
      ) : null}
    </div>
  );
}

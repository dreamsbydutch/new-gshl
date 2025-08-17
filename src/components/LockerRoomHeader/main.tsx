import { TeamInfo, TeamLogo } from "./components";
import type { LockerRoomHeaderProps } from "./utils";
import { formatOwnerName } from "./utils";

/**
 * Renders the locker room header for a team (orchestrator component).
 *
 * Responsibilities:
 * - Derive `formattedOwnerName` (simple synchronous string formatting; no hook needed)
 * - Compose presentational subcomponents: `TeamLogo` + `TeamInfo`
 * - Keep layout / spacing concerns local (flex distribution)
 *
 * Contract / assumptions:
 * - Receives a fully-populated `currentTeam` (no loading state handled here)
 * - Performs ZERO data fetching, subscriptions, or global store reads
 * - Contains no conditional rendering branches beyond static composition (no skeleton state)
 *
 * Downstream props passed:
 * - To `TeamLogo`: `currentTeam`
 * - To `TeamInfo`: `currentTeam`, derived `formattedOwnerName`
 *
 * @param currentTeam Active team entity whose branding & owner info are displayed.
 * @returns Header element containing logo + team / owner text.
 * @remarks Pure & synchronous; safe to render repeatedly. Promote additional derived values
 *          to a dedicated hook ONLY when logic becomes non-trivial (branching, memo needs).
 */
export function LockerRoomHeader({ currentTeam }: LockerRoomHeaderProps) {
  // Simple derived string; hook abstraction unnecessary per guidelines (trivial derivation).
  const formattedOwnerName = formatOwnerName(currentTeam);

  return (
    <header className="flex items-center justify-evenly p-4">
      <TeamLogo currentTeam={currentTeam} />
      <TeamInfo
        currentTeam={currentTeam}
        formattedOwnerName={formattedOwnerName}
      />
    </header>
  );
}

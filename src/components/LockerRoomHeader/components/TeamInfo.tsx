import type { TeamInfoProps } from "../utils";

/**
 * Displays the team name and formatted owner name.
 * Stateless: all formatting performed upstream.
 */
export const TeamInfo = ({
  currentTeam,
  formattedOwnerName,
}: TeamInfoProps) => (
  <div className="flex flex-col items-center">
    <h1 className="text-center text-3xl font-bold">{currentTeam.name}</h1>
    <span className="text-lg font-semibold">{formattedOwnerName}</span>
  </div>
);

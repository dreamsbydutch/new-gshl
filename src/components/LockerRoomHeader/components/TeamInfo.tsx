import type { GSHLTeam } from "@gshl-types";

interface TeamInfoProps {
  currentTeam: GSHLTeam;
  formattedOwnerName: string;
}

export const TeamInfo = ({
  currentTeam,
  formattedOwnerName,
}: TeamInfoProps) => {
  return (
    <div className="flex flex-col items-center">
      <h1 className="text-center text-3xl font-bold">{currentTeam.name}</h1>
      <span className="text-lg font-semibold">{formattedOwnerName}</span>
    </div>
  );
};

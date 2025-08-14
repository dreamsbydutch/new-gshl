import { TeamInfo, TeamLogo } from "./components";
import { useLockerRoomHeaderData } from "./hooks";
import type { LockerRoomHeaderProps } from "./utils";

export function LockerRoomHeader({ currentTeam }: LockerRoomHeaderProps) {
  const { formattedOwnerName } = useLockerRoomHeaderData(currentTeam);

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

import { StandingsGroupComponent } from "./components";
import { useStandingsData } from "@gshl-hooks";
import type { StandingsContainerProps } from "@gshl-utils/standings-container";

export const StandingsContainer = ({
  standingsType,
}: StandingsContainerProps) => {
  const { selectedSeason, groups } = useStandingsData(standingsType);

  return (
    <>
      {groups.map((group) => (
        <StandingsGroupComponent
          key={group.title}
          group={group}
          selectedSeason={selectedSeason ?? null}
          standingsType={standingsType}
        />
      ))}
    </>
  );
};

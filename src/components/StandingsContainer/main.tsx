import { StandingsGroupComponent } from "./components";
import { useStandingsData } from "./hooks";
import { StandingsContainerProps } from "./utils/types";

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

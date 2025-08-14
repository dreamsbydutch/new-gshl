import { cn } from "@gshl-utils";
import { StandingsItem } from "./StandingsItem";
import type { StandingsGroup } from "../utils/types";
import type { Season } from "@gshl-types";

interface StandingsGroupProps {
  group: StandingsGroup;
  selectedSeason: Season | null;
  standingsType: string;
}

export const StandingsGroupComponent = ({
  group,
  selectedSeason,
  standingsType,
}: StandingsGroupProps) => {
  return (
    <div key={group.title}>
      <div className="mt-8 text-center font-varela text-sm font-bold">
        {group.title}
      </div>
      <div
        className={cn(
          "mb-4 rounded-xl p-2 shadow-md [&>*:last-child]:border-none",
        )}
      >
        {selectedSeason &&
          group.teams.map((team) => {
            return (
              <StandingsItem
                key={team.id}
                team={team}
                season={selectedSeason}
                standingsType={standingsType}
              />
            );
          })}
      </div>
    </div>
  );
};

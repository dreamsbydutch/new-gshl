"use client";

/**
 * Week Navigation Component
 *
 * Week selection functionality with playoff styling and horizontal scrollable interface.
 */

import { cn } from "@gshl-utils";
import { SeasonType, type Week } from "@gshl-types";
import { useNavStore } from "@gshl-cache";
import { useWeeks } from "@gshl-hooks";
import { HorizontalToggle } from "./toggle";

interface WeeksToggleProps {
  className?: string;
}

/**
 * Week selection toggle component with playoff styling
 * @param props - Component props
 * @returns Horizontal scrollable week selection interface
 */
export function WeeksToggle({ className }: WeeksToggleProps) {
  const seasonId = useNavStore((state) => state.selectedSeasonId);
  const { data: weeks } = useWeeks({ seasonId });
  const selectedWeekId = useNavStore((state) => state.selectedWeekId);
  const setWeekId = useNavStore((state) => state.setWeekId);

  const selectedWeek = weeks?.find((w) => w.id === selectedWeekId) ?? null;

  const handleWeekSelect = (week: Week) => {
    setWeekId(week.id);
  };

  const getWeekKey = (week: Week) => week.id.toString();

  const getWeekLabel = (week: Week) => `W${week.weekNum}`;

  const getWeekDescription = (week: Week) => {
    if (week.weekType === SeasonType.PLAYOFFS) {
      return "Playoffs";
    }
    return undefined;
  };

  const renderWeekItem = (week: Week, isSelected: boolean) => (
    <div className="text-center">
      <div
        className={cn(
          "py-0.5",
          week.weekNum < 10 ? "px-1.5" : "px-0.5",
          isSelected
            ? "rounded-sm bg-slate-200 font-bold text-gray-900 shadow-md"
            : "text-gray-700",
          week.weekType === SeasonType.PLAYOFFS && isSelected && "bg-amber-100",
          week.weekType === SeasonType.PLAYOFFS && "font-bold text-amber-900",
        )}
      >
        {week.weekNum}
      </div>
    </div>
  );

  return (
    <HorizontalToggle<Week>
      items={weeks ?? []}
      selectedItem={selectedWeek}
      onSelect={handleWeekSelect}
      getItemKey={getWeekKey}
      getItemLabel={getWeekLabel}
      getItemDescription={getWeekDescription}
      renderCustomItem={renderWeekItem}
      className={className}
    />
  );
}

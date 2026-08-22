"use client";

/**
 * Week Navigation Component
 *
 * Week selection functionality with playoff styling and horizontal scrollable interface.
 */

import { cn, SeasonType } from "@gshl-utils";
import type { Week, WeeksToggleProps } from "@gshl-types";
import { useNav, useWeekNavigation, useWeeks } from "@gshl-hooks";
import { WeeksToggleSkeleton } from "@gshl-skeletons";
import { HorizontalToggle } from "./Toggle";

/**
 * Week selection toggle component with playoff styling
 * @param props - Component props
 * @returns Horizontal scrollable week selection interface
 */
export function WeeksToggle({
  className,
  seasonId: seasonIdOverride,
  selectedWeekId: selectedWeekIdOverride,
  onSelectWeek,
}: WeeksToggleProps) {
  const { selectedSeasonId: storedSeasonId } = useNav();
  const seasonId =
    seasonIdOverride !== undefined ? seasonIdOverride : storedSeasonId;
  const { data: weeks, isLoading } = useWeeks({
    seasonId,
    enabled: Boolean(seasonId),
  });
  const { selectedWeekId: storedWeekId, setSelectedWeekId: setWeekId } =
    useWeekNavigation({
      autoSelect: selectedWeekIdOverride === undefined,
      seasonId,
    });
  const selectedWeekId =
    selectedWeekIdOverride !== undefined
      ? selectedWeekIdOverride
      : storedWeekId;

  const selectedWeek = weeks?.find((w) => w.id === selectedWeekId) ?? null;

  const handleWeekSelect = (week: Week) => {
    if (onSelectWeek) {
      onSelectWeek(week.id);
      return;
    }
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
            ? "rounded-sm bg-slate-200 font-bold text-gray-900 ring-1 ring-slate-300"
            : "text-gray-700",
          week.weekType === SeasonType.PLAYOFFS && isSelected && "bg-amber-100",
          week.weekType === SeasonType.PLAYOFFS && "font-bold text-amber-900",
        )}
      >
        {week.weekNum}
      </div>
    </div>
  );

  if (!seasonId || isLoading) {
    return <WeeksToggleSkeleton className={className} />;
  }

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

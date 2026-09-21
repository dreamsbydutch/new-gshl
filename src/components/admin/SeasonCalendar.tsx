import type { useScheduleBuilderView } from "@gshl-hooks/features/useScheduleBuilderView";
import { Button } from "../ui/ButtonPrimitive";
import { Input } from "../ui/InputPrimitive";

export function SeasonCalendar({
  view,
}: {
  view: ReturnType<typeof useScheduleBuilderView>;
}) {
  if (!view.context) return null;
  const saved = view.context.calendar;
  return (
    <details
      className="rounded-lg border border-slate-200 p-4"
      open={!saved.length || view.editingSavedCalendar}
    >
      <summary className="cursor-pointer font-semibold">
        Season calendar
      </summary>
      {saved.length ? (
        <>
          <p className="my-3 text-sm">
            {view.context.regularWeeks} regular-season weeks and{" "}
            {saved.filter((week) => week.isPlayoffs).length} playoff weeks
            saved. Future weeks can be adjusted, including after publishing.
            Started weeks are locked.
          </p>
          {!view.editingSavedCalendar && (
            <Button
              className="mb-3"
              disabled={view.busy}
              onClick={view.openCalendarEditor}
            >
              Edit calendar
            </Button>
          )}
          {!view.editingSavedCalendar && (
            <ol className="space-y-1 text-sm">
              {saved.map((week) => (
                <li key={week.weekNum}>
                  Week {week.weekNum} ·{" "}
                  {week.isPlayoffs ? "Playoffs" : "Regular season"} ·{" "}
                  {week.startDate ?? "Missing start date"} through{" "}
                  {week.endDate ?? "Missing end date"}
                </li>
              ))}
            </ol>
          )}
        </>
      ) : (
        <>
          <p className="my-3 text-sm text-slate-600">
            Create {view.weeks} regular-season weeks followed by playoff weeks.
            The league rulebook uses three playoff weeks. Preview starts with
            seven-day weeks; adjust dates for breaks or longer matchups and set
            the number of game days. Dates include both the start and end day.
            Playoff opponents are assigned separately.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              First week starts
              <Input
                className="mt-1"
                type="date"
                value={view.calendarStart}
                disabled={view.busy}
                onChange={(event) => view.setCalendarStart(event.target.value)}
              />
            </label>
            <label className="text-sm">
              Playoff weeks
              <Input
                className="mt-1"
                type="number"
                min={1}
                max={10}
                value={view.playoffWeeks}
                disabled={view.busy}
                onChange={(event) =>
                  view.setPlayoffWeeks(Number(event.target.value))
                }
              />
            </label>
          </div>
          <Button
            className="mt-3"
            disabled={
              view.busy || !view.calendarStart || view.context.hasSchedule
            }
            onClick={view.previewCalendar}
          >
            Preview calendar
          </Button>
          {view.context.hasSchedule && (
            <p className="mt-2 text-sm text-amber-800">
              This season already has matchups. Calendar creation is
              unavailable.
            </p>
          )}
        </>
      )}
      {view.calendarRows.length > 0 && (
        <>
          {view.editingSavedCalendar && (
            <div className="mt-4 space-y-3 rounded border border-slate-200 p-3">
              <p className="text-sm">
                Correct the regular-season or playoff week count before
                publishing or recording season data. Retained weeks keep their
                dates and lengths; added weeks start at seven days. Removing
                regular-season weeks moves playoffs earlier.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Regular-season week count
                  <Input
                    className="mt-1"
                    type="number"
                    min={19}
                    max={49}
                    step={2}
                    value={view.calendarRegularCount}
                    disabled={
                      view.busy ||
                      view.context.hasSchedule ||
                      view.lockedCalendarWeeks.some(Boolean)
                    }
                    onChange={(event) =>
                      view.setCalendarRegularCount(Number(event.target.value))
                    }
                  />
                </label>
                <label className="text-sm">
                  Playoff week count
                  <Input
                    className="mt-1"
                    type="number"
                    min={1}
                    max={10}
                    value={view.calendarPlayoffCount}
                    disabled={
                      view.busy ||
                      view.context.hasSchedule ||
                      view.lockedCalendarWeeks.some(Boolean)
                    }
                    onChange={(event) =>
                      view.setCalendarPlayoffCount(Number(event.target.value))
                    }
                  />
                </label>
              </div>
              <Button
                disabled={
                  view.busy ||
                  view.context.hasSchedule ||
                  view.lockedCalendarWeeks.some(Boolean)
                }
                onClick={view.resizeCalendarPreview}
              >
                Apply counts to preview
              </Button>
              {view.context.hasSchedule && (
                <p className="text-sm text-amber-800">
                  This season has a published schedule. You can adjust future
                  dates, but changing the week count requires resolving its
                  existing matchups first.
                </p>
              )}
            </div>
          )}
          <p className="mt-4 text-sm text-slate-600">
            Adjust any week to span the dates you need. Changing its end date
            automatically moves all following weeks, keeping their lengths and
            gaps. Full-week game-day counts follow the new length; custom counts
            remain editable.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Week</th>
                  <th className="p-2">Starts</th>
                  <th className="p-2">Ends</th>
                  <th className="p-2">Game days</th>
                </tr>
              </thead>
              <tbody>
                {view.calendarRows.map((week, index) => (
                  <tr key={index}>
                    <td className="whitespace-nowrap p-2">
                      {index + 1} ·{" "}
                      {week.isPlayoffs ? "Playoffs" : "Regular season"}
                    </td>
                    <td className="p-2">
                      <Input
                        type="date"
                        aria-label={`Week ${index + 1} starts`}
                        value={week.startDate}
                        disabled={view.busy || view.lockedCalendarWeeks[index]}
                        onChange={(event) =>
                          view.editCalendarWeek(index, {
                            startDate: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="date"
                        aria-label={`Week ${index + 1} ends`}
                        value={week.endDate}
                        disabled={view.busy || view.lockedCalendarWeeks[index]}
                        onChange={(event) =>
                          view.editCalendarWeek(index, {
                            endDate: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min={1}
                        aria-label={`Week ${index + 1} game days`}
                        value={week.gameDays}
                        disabled={view.busy || view.lockedCalendarWeeks[index]}
                        onChange={(event) =>
                          view.editCalendarWeek(index, {
                            gameDays: Number(event.target.value),
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="my-3 text-sm">
            Review these dates before saving {view.calendarRows.length} weeks to
            the selected season.{" "}
            {view.editingSavedCalendar
              ? "Saving updates this calendar immediately."
              : "Saving creates the calendar immediately."}
          </p>
          {view.calendarCountPending && (
            <p className="mb-3 text-sm text-amber-800">
              Apply the week counts to the preview before saving.
            </p>
          )}
          <Button
            disabled={
              view.busy ||
              view.calendarCountPending ||
              (!view.editingSavedCalendar && view.context.hasSchedule)
            }
            onClick={() => void view.saveCalendar()}
          >
            {view.editingSavedCalendar
              ? "Save calendar changes"
              : "Save calendar to season"}
          </Button>
          <Button
            className="ml-3"
            disabled={view.busy}
            onClick={view.cancelCalendarEditor}
          >
            Cancel
          </Button>
        </>
      )}
    </details>
  );
}

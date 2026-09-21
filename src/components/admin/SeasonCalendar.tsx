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
      open={!saved.length}
    >
      <summary className="cursor-pointer font-semibold">
        Season calendar
      </summary>
      {saved.length ? (
        <>
          <p className="my-3 text-sm">
            {view.context.regularWeeks} regular-season weeks and{" "}
            {saved.filter((week) => week.isPlayoffs).length} playoff weeks
            saved. Existing calendars cannot be replaced here.
          </p>
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
          {view.calendarRows.length > 0 && (
            <>
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
                            disabled={view.busy}
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
                            disabled={view.busy}
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
                            disabled={view.busy}
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
                Review these dates before saving {view.calendarRows.length}{" "}
                weeks to the selected season. Saving creates the calendar
                immediately.
              </p>
              <Button
                disabled={view.busy || view.context.hasSchedule}
                onClick={() => void view.saveCalendar()}
              >
                Save calendar to season
              </Button>
            </>
          )}
        </>
      )}
    </details>
  );
}

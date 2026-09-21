"use client";

import { useMemo, useState } from "react";
import { useScheduleBuilder } from "../main/useScheduleBuilder";
import {
  generateSchedule,
  scheduleBalance,
} from "@gshl-utils/features/schedule-builder";
import type { BuilderGame } from "@gshl-lib/types/schedule-builder";
import {
  previewSeasonCalendar,
  validateSeasonCalendar,
  validateCalendarDates,
  editSeasonCalendarWeek,
  resizeSeasonCalendar,
} from "@gshl-utils/features/season-calendar";
import type { CalendarWeek } from "@gshl-lib/types/season-calendar";

export function useScheduleBuilderView() {
  const [seasonId, setSeasonId] = useState("");
  const [weeks, setWeeks] = useState(21);
  const [seed, setSeed] = useState(1);
  const [draft, setDraft] = useState<{
    games: BuilderGame[];
    fingerprint: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const data = useScheduleBuilder(seasonId);
  const [calendarStart, setCalendarStart] = useState("");
  const [playoffWeeks, setPlayoffWeeks] = useState(3);
  const [calendarRegularCount, setCalendarRegularCount] = useState(21);
  const [calendarPlayoffCount, setCalendarPlayoffCount] = useState(3);
  const [calendarDraft, setCalendarDraft] = useState<{
    key: string;
    rows: CalendarWeek[];
    resized?: boolean;
    saved?: { revision: string; ids: string[]; locked: boolean[] };
  } | null>(null);
  const calendarKey = JSON.stringify([
    seasonId,
    weeks,
    playoffWeeks,
    calendarStart,
  ]);
  const savedCalendarKey = JSON.stringify([seasonId, "saved"]);
  const editingSavedCalendar = calendarDraft?.key === savedCalendarKey;
  const calendarRows =
    calendarDraft?.key === calendarKey || editingSavedCalendar
      ? calendarDraft.rows
      : [];
  const lockedCalendarWeeks = editingSavedCalendar
    ? calendarDraft.saved!.locked
    : [];
  const openCalendarEditor = () => {
    if (!data.context?.calendar.length) return;
    setError("");
    setMessage("");
    setCalendarRegularCount(data.context.regularWeeks);
    setCalendarPlayoffCount(
      data.context.calendar.filter((week) => week.isPlayoffs).length,
    );
    setCalendarDraft({
      key: savedCalendarKey,
      rows: data.context.calendar.map((week) => ({
        startDate: week.startDate ?? "",
        endDate: week.endDate ?? "",
        gameDays: week.gameDays,
        isPlayoffs: week.isPlayoffs,
      })),
      saved: {
        revision: data.context.calendarRevision,
        ids: data.context.calendar.map((week) => week.id),
        locked: data.context.calendar.map(
          (week) =>
            week.isActive || Date.parse(week.startDate ?? "") <= Date.now(),
        ),
      },
    });
  };
  const cancelCalendarEditor = () => setCalendarDraft(null);
  const resizeCalendarPreview = () => {
    if (!calendarDraft || !editingSavedCalendar) return;
    setError("");
    try {
      const rows = resizeSeasonCalendar(
        calendarRows,
        calendarRegularCount,
        calendarPlayoffCount,
      );
      setCalendarDraft({ ...calendarDraft, rows, resized: true });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not adjust week counts.",
      );
    }
  };
  const previewCalendar = () => {
    setError("");
    setMessage("");
    try {
      const rows = previewSeasonCalendar(calendarStart, weeks, playoffWeeks);
      validateSeasonCalendar(rows, Date.now());
      setCalendarDraft({ key: calendarKey, rows });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Calendar preview failed.",
      );
    }
  };
  const editCalendarWeek = (index: number, patch: Partial<CalendarWeek>) => {
    if (!calendarDraft || lockedCalendarWeeks[index]) return;
    // Date inputs emit empty values while a date is incomplete. Keep the last
    // complete date so the eventual edit can move following weeks accurately.
    if (patch.startDate === "" || patch.endDate === "") return;
    setCalendarDraft({
      ...calendarDraft,
      rows: editSeasonCalendarWeek(calendarRows, index, patch, true),
    });
  };
  const saveCalendar = async () => {
    if (!calendarRows.length || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (editingSavedCalendar) {
        validateCalendarDates(calendarRows);
        const original = calendarDraft.saved!;
        if (calendarDraft.resized) {
          const result = await data.resizeCalendar(
            original.revision,
            calendarRows,
          );
          setWeeks(calendarRows.filter((week) => !week.isPlayoffs).length);
          setConfirmed(false);
          setMessage(
            `Saved ${result.weeks} calendar weeks. Generate a draft matching the corrected regular-season length.`,
          );
        } else {
          const result = await data.updateCalendar(
            original.revision,
            calendarRows.map((week, index) => ({
              ...week,
              id: original.ids[index]!,
            })),
          );
          setMessage(
            `Updated dates for ${result.weeks} weeks. Existing matchup assignments are preserved.`,
          );
        }
      } else {
        validateSeasonCalendar(calendarRows, Date.now());
        const result = await data.createCalendar(calendarRows);
        setMessage(
          `Created ${result.weeks} calendar weeks, including ${playoffWeeks} playoff weeks. You can now publish a matching regular-season draft.`,
        );
      }
      setCalendarDraft(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Calendar creation failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const fingerprint = JSON.stringify([
    seasonId,
    weeks,
    seed,
    data.context?.teams,
    data.context?.history,
  ]);
  const games = useMemo(
    () => (draft?.fingerprint === fingerprint ? draft.games : []),
    [draft, fingerprint],
  );
  const balance = useMemo(
    () =>
      data.context
        ? scheduleBalance(data.context.teams, data.context.history, games)
        : [],
    [data.context, games],
  );
  const generate = async () => {
    if (!data.context) return;
    setBusy(true);
    setError("");
    setMessage("");
    setConfirmed(false);
    // Allow the pending UI to paint before the bounded CPU search.
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      setDraft({
        games: generateSchedule(
          data.context.teams,
          weeks,
          data.context.history,
          seed,
        ),
        fingerprint,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    if (!games.length || !confirmed) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await data.publish(weeks, games);
      setMessage(`Published ${result.games} games to the season.`);
      setConfirmed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Publishing failed.");
    } finally {
      setBusy(false);
    }
  };
  const download = () => {
    if (!data.context || !games.length) return;
    const names = new Map(data.context.teams.map((t) => [t.id, t.name]));
    const cell = (value: string | number) =>
      `"${String(value)
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""')}"`;
    const csv = [
      ["Week", "Away", "Home", "Away team ID", "Home team ID"],
      ...games.map((g) => [
        g.week,
        names.get(g.away) ?? g.away,
        names.get(g.home) ?? g.home,
        g.away,
        g.home,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `schedule-${seasonId}-${weeks}-weeks-seed-${seed}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const swapWeeks = (first: number, second: number) => {
    if (!games.length || second < 1 || second > weeks) return;
    setDraft({
      fingerprint,
      games: games
        .map((g) => ({
          ...g,
          week: g.week === first ? second : g.week === second ? first : g.week,
        }))
        .sort((a, b) => a.week - b.week),
    });
    setConfirmed(false);
  };
  return {
    ...data,
    calendarStart,
    setCalendarStart,
    playoffWeeks,
    setPlayoffWeeks,
    calendarRows,
    editingSavedCalendar,
    calendarCountPending:
      editingSavedCalendar &&
      (calendarRegularCount !==
        calendarRows.filter((week) => !week.isPlayoffs).length ||
        calendarPlayoffCount !==
          calendarRows.filter((week) => week.isPlayoffs).length),
    calendarRegularCount,
    setCalendarRegularCount,
    calendarPlayoffCount,
    setCalendarPlayoffCount,
    resizeCalendarPreview,
    lockedCalendarWeeks,
    openCalendarEditor,
    cancelCalendarEditor,
    previewCalendar,
    editCalendarWeek,
    saveCalendar,
    seasonId,
    setSeasonId,
    weeks,
    setWeeks,
    seed,
    setSeed,
    games,
    balance,
    error,
    message,
    busy,
    confirmed,
    setConfirmed,
    generate,
    publish,
    download,
    swapWeeks,
  };
}

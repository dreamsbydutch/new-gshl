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
  const [calendarDraft, setCalendarDraft] = useState<{
    key: string;
    rows: CalendarWeek[];
  } | null>(null);
  const calendarKey = JSON.stringify([
    seasonId,
    weeks,
    playoffWeeks,
    calendarStart,
  ]);
  const calendarRows =
    calendarDraft?.key === calendarKey ? calendarDraft.rows : [];
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
    setCalendarDraft({
      key: calendarKey,
      rows: calendarRows.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    });
  };
  const saveCalendar = async () => {
    if (!calendarRows.length || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      validateSeasonCalendar(calendarRows, Date.now());
      const result = await data.createCalendar(calendarRows);
      setCalendarDraft(null);
      setMessage(
        `Created ${result.weeks} calendar weeks, including ${playoffWeeks} playoff weeks. You can now publish a matching regular-season draft.`,
      );
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

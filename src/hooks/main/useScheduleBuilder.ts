"use client";

import { useMemo } from "react";
import { combineScheduleHistory } from "@gshl-utils/features/schedule-builder";
import { useMutation, useQueries, type RequestForQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BuilderGame } from "@gshl-lib/types/schedule-builder";

export function useScheduleBuilder(seasonId: string) {
  // Convex resets subscription state during render when request identity changes.
  const queries = useMemo<RequestForQueries>(
    () => ({
      seasons: { query: api.schedule.builderSeasons, args: {} },
      ...(seasonId
        ? {
            context: {
              query: api.schedule.builderContext,
              args: { seasonId },
            },
          }
        : {}),
    }),
    [seasonId],
  );
  const results = useQueries(queries);
  const seasonsResult = results.seasons as
    | FunctionReturnType<typeof api.schedule.builderSeasons>
    | Error
    | undefined;
  const contextResult = results.context as
    | FunctionReturnType<typeof api.schedule.builderContext>
    | Error
    | undefined;
  const seasons = seasonsResult instanceof Error ? undefined : seasonsResult;
  const catalog = contextResult instanceof Error ? undefined : contextResult;
  const historySeasonIds = catalog?.historySeasonIds;
  const historyQueries = useMemo<RequestForQueries>(
    () =>
      Object.fromEntries(
        (historySeasonIds ?? []).map((historySeasonId) => [
          historySeasonId,
          {
            query: api.schedule.builderSeasonHistory,
            args: { seasonId: seasonId as Id<"seasons">, historySeasonId },
          },
        ]),
      ),
    [seasonId, historySeasonIds],
  );
  const historyResults = useQueries(historyQueries);
  const batches = (catalog?.historySeasonIds ?? []).map(
    (id) =>
      historyResults[id] as
        | FunctionReturnType<typeof api.schedule.builderSeasonHistory>
        | Error
        | undefined,
  );
  const historyError = batches.find(
    (batch): batch is Error => batch instanceof Error,
  );
  const context = useMemo(() => {
    if (!catalog) return undefined;
    const loaded = catalog.historySeasonIds.map(
      (id) =>
        historyResults[id] as
          | FunctionReturnType<typeof api.schedule.builderSeasonHistory>
          | Error
          | undefined,
    );
    if (loaded.some((batch) => batch === undefined || batch instanceof Error))
      return undefined;
    return {
      ...catalog,
      historySeasons: catalog.historySeasonIds.length,
      ...combineScheduleHistory(
        loaded as FunctionReturnType<
          typeof api.schedule.builderSeasonHistory
        >[],
      ),
    };
  }, [catalog, historyResults]);
  const publish = useMutation(api.schedule.publishBuilderSchedule);
  return {
    seasons,
    context,
    loadError:
      seasonsResult instanceof Error
        ? seasonsResult.message
        : contextResult instanceof Error
          ? contextResult.message
          : (historyError?.message ?? null),
    publish: (weeks: number, games: BuilderGame[]) =>
      publish({
        seasonId: seasonId as Id<"seasons">,
        weeks,
        games: games.map((g) => ({
          ...g,
          home: g.home as Id<"teams">,
          away: g.away as Id<"teams">,
        })),
      }),
  };
}

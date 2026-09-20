"use client";

import { useMutation, useQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BuilderGame } from "@gshl-lib/types/schedule-builder";

export function useScheduleBuilder(seasonId: string) {
  const results = useQueries({
    seasons: { query: api.schedule.builderSeasons, args: {} },
    ...(seasonId
      ? {
          context: {
            query: api.schedule.builderContext,
            args: { seasonId },
          },
        }
      : {}),
  });
  const seasonsResult = results.seasons as
    FunctionReturnType<typeof api.schedule.builderSeasons> | Error | undefined;
  const contextResult = results.context as
    FunctionReturnType<typeof api.schedule.builderContext> | Error | undefined;
  const seasons = seasonsResult instanceof Error ? undefined : seasonsResult;
  const context = contextResult instanceof Error ? undefined : contextResult;
  const publish = useMutation(api.schedule.publishBuilderSchedule);
  return {
    seasons,
    context,
    loadError:
      seasonsResult instanceof Error
        ? seasonsResult.message
        : contextResult instanceof Error
          ? contextResult.message
          : null,
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

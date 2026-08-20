"use client";

import { useCallback } from "react";

import type { MatchupNavigationSide } from "@gshl-types";
import {
  buildContextualNavigationHref,
  readContextualNavigationQuery,
  resolveMatchupBackHref,
  resolveMatchupNavigationSide,
} from "@gshl-utils";
import { useAppPathname, useAppRouter, useAppSearchParams } from "../main";

/** Keeps the selected matchup team shareable without adding tab changes to history. */
export function useMatchupContextNavigation(
  fallbackSeasonId: string,
  fallbackWeekId: string,
) {
  const { pathname } = useAppPathname();
  const { router } = useAppRouter();
  const { search } = useAppSearchParams();
  const selectedSide = resolveMatchupNavigationSide(search);
  const backHref = resolveMatchupBackHref(search, {
    season: fallbackSeasonId,
    week: fallbackWeekId,
  });
  const backLabel = backHref.startsWith("/lockerroom")
    ? "Back to My Team"
    : backHref.startsWith("/headlines")
      ? "Back to Press Box"
      : "Back to Schedule";

  const selectSide = useCallback(
    (side: MatchupNavigationSide) => {
      const query = readContextualNavigationQuery(search);
      const href = buildContextualNavigationHref(pathname, search, {
        view: query.view,
        season: query.season,
        week: query.week,
        owner: query.owner,
        from: query.from,
        side,
      });
      router.replace(href, { scroll: false });
    },
    [pathname, router, search],
  );

  return {
    backHref,
    backLabel,
    selectedSide,
    selectSide,
  };
}

import type { Season } from "@gshl-types";

export type SeasonSummary = {
  id: string;
  name: string;
  year: number;
};

function coerceDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function compareByStartDateAsc(a: Season, b: Season): number {
  const aTime = coerceDate(a.startDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  const bTime = coerceDate(b.startDate)?.getTime() ?? Number.POSITIVE_INFINITY;

  return aTime - bTime;
}

function compareByStartDateDesc(a: Season, b: Season): number {
  const aTime = coerceDate(a.startDate)?.getTime() ?? Number.NEGATIVE_INFINITY;
  const bTime = coerceDate(b.startDate)?.getTime() ?? Number.NEGATIVE_INFINITY;

  return bTime - aTime;
}

function isWithinSeason(season: Season, reference: Date): boolean {
  const start = coerceDate(season.startDate);
  const end = coerceDate(season.endDate);
  if (!start || !end) return false;

  const refTime = reference.getTime();
  return start.getTime() <= refTime && refTime <= end.getTime();
}

export function findCurrentSeason(
  seasons: Season[] | undefined,
  referenceDate: Date = new Date(),
): Season | undefined {
  if (!seasons?.length) return undefined;

  return seasons.find((season) => isWithinSeason(season, referenceDate));
}

export function findUpcomingSeason(
  seasons: Season[] | undefined,
  referenceDate: Date = new Date(),
): Season | undefined {
  if (!seasons?.length) return undefined;

  const upcoming = seasons
    .filter((season) => {
      const start = coerceDate(season.startDate);
      if (!start) return false;
      return start.getTime() > referenceDate.getTime();
    })
    .sort(compareByStartDateAsc);

  return upcoming[0];
}

export function findMostRecentSeason(
  seasons: Season[] | undefined,
  referenceDate: Date = new Date(),
): Season | undefined {
  if (!seasons?.length) return undefined;

  const previous = seasons
    .filter((season) => {
      const start = coerceDate(season.startDate);
      if (!start) return false;
      return start.getTime() <= referenceDate.getTime();
    })
    .sort(compareByStartDateDesc);

  return previous[0];
}

export function resolveDefaultSeason(
  seasons: Season[] | undefined,
  referenceDate: Date = new Date(),
): Season | undefined {
  if (!seasons?.length) return undefined;

  return (
    findCurrentSeason(seasons, referenceDate) ??
    findUpcomingSeason(seasons, referenceDate) ??
    findMostRecentSeason(seasons, referenceDate) ??
    seasons[0]
  );
}

export function findSeasonById(
  seasons: Season[] | undefined,
  seasonId: string | number | null | undefined,
): Season | undefined {
  if (!seasons?.length || seasonId == null) return undefined;
  const target = String(seasonId);
  return seasons.find((season) => String(season.id) === target);
}

export function toSeasonSummary(
  season: Season | undefined | null,
): SeasonSummary | undefined {
  if (!season) return undefined;

  return {
    id: String(season.id),
    name: season.name,
    year: season.year,
  };
}

export function buildSeasonSummaries(
  seasons: Season[] | undefined,
): SeasonSummary[] {
  if (!seasons?.length) return [];

  return seasons
    .map((season) => toSeasonSummary(season))
    .filter((summary): summary is SeasonSummary => Boolean(summary));
}

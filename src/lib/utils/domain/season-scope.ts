/** NHL reference years share canonical season IDs without becoming fantasy seasons. */
export function isFantasySeason(season: object): boolean {
  return !("nhlOnly" in season && season.nhlOnly === true);
}

/** Missing flags preserve existing GSHL seasons; NHL workflows opt in explicitly. */
export function selectSeasonScope<T extends object>(
  seasons: readonly T[],
  options: { includeNhlOnly?: boolean } = {},
): T[] {
  return options.includeNhlOnly
    ? [...seasons]
    : seasons.filter(isFantasySeason);
}

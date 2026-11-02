import type {
  BuildPowerRankingsOptions,
  PowerRankingChartPoint,
  PowerRankingColorMap,
  PowerRankingColorSource,
  PowerRankingEntry,
  PowerRankingPaletteMap,
  PowerRankingWeek,
  PowerRankingWeeklyStat,
  PowerRankingsViewModel,
} from "@gshl-types";

const SERIES_COLORS = [
  "#2563eb",
  "#dc2626",
  "#059669",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "#c026d3",
  "#4f46e5",
  "#65a30d",
  "#db2777",
  "#0f766e",
  "#9333ea",
  "#b45309",
  "#0284c7",
  "#be123c",
  "#475569",
] as const;

const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

const colorDistance = (left: string, right: string) => {
  const channels = (color: string) => [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
  const [leftRed = 0, leftGreen = 0, leftBlue = 0] = channels(left);
  const [rightRed = 0, rightGreen = 0, rightBlue = 0] = channels(right);
  return Math.sqrt(
    (leftRed - rightRed) ** 2 +
      (leftGreen - rightGreen) ** 2 +
      (leftBlue - rightBlue) ** 2,
  );
};

const isChartColor = (color: string) => {
  if (!isHexColor(color)) return false;
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const brightness = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return brightness >= 35 && brightness <= 215;
};

export function selectDistinctPowerRankingColors(
  sources: PowerRankingColorSource[],
  palettes: PowerRankingPaletteMap,
): PowerRankingColorMap {
  const selected: PowerRankingColorMap = {};
  const usedColors: string[] = [];

  for (const source of sources) {
    const candidates = [
      ...(palettes[source.teamId] ?? []),
      source.fallbackColor,
    ].filter(
      (color, index, colors) =>
        isChartColor(color) && colors.indexOf(color) === index,
    );
    const fallback = isChartColor(source.fallbackColor)
      ? source.fallbackColor
      : "#475569";
    const color =
      candidates
        .map((candidate, index) => ({
          candidate,
          score:
            (usedColors.length
              ? Math.min(
                  ...usedColors.map((used) => colorDistance(candidate, used)),
                )
              : 200) + Math.max(0, 24 - index * 4),
        }))
        .sort((left, right) => right.score - left.score)[0]?.candidate ??
      fallback;
    selected[source.teamId] = color;
    usedColors.push(color);
  }

  return selected;
}

const validRank = (value: unknown): number | null => {
  const rank = Number(value);
  return Number.isFinite(rank) && rank > 0 ? Math.round(rank) : null;
};

const validRating = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const rating = Number(value);
  return Number.isFinite(rating) ? rating : null;
};

// Fixed display scales, independent of the visible teams or week. These are
// input visualizations, not historical percentiles or changes to power math.
const inputDisplayRating = (
  value: unknown,
  midpoint: number,
  pointsPerUnit: number,
): number | null => {
  const rating = validRating(value);
  return rating === null
    ? null
    : Math.max(0, Math.min(100, 50 + (rating - midpoint) * pointsPerUnit));
};
const performanceDisplayRating = (value: unknown) =>
  inputDisplayRating(value, 0, 40);
// Raw talent 60 -> 20, 67.5 -> 50, 75 -> 80.
const talentDisplayRating = (value: unknown) =>
  inputDisplayRating(value, 67.5, 4);

const compareWeeks = (left: PowerRankingWeek, right: PowerRankingWeek) => {
  const dateDifference =
    new Date(left.startDate).getTime() - new Date(right.startDate).getTime();
  return dateDifference || left.weekNum - right.weekNum;
};

const getWeekLabel = (week: PowerRankingWeek) => {
  if (week.weekType === "PO") return `Playoffs ${week.weekNum}`;
  if (week.weekType === "LT") return `Losers ${week.weekNum}`;
  return `Week ${week.weekNum}`;
};

const getStatByTeam = (stats: PowerRankingWeeklyStat[]) =>
  new Map(stats.map((stat) => [stat.gshlTeamId, stat]));

export function buildPowerRankings({
  teams,
  weeks,
  weeklyStats,
  seasonStats,
  preseason = [],
}: BuildPowerRankingsOptions): PowerRankingsViewModel {
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const statsByWeek = new Map<string, PowerRankingWeeklyStat[]>();

  for (const stat of weeklyStats) {
    if (!teamById.has(stat.gshlTeamId) || validRank(stat.powerRk) === null) {
      continue;
    }
    const existing = statsByWeek.get(stat.weekId) ?? [];
    existing.push(stat);
    statsByWeek.set(stat.weekId, existing);
  }

  const rankedWeeks = [...weeks]
    .filter((week) => statsByWeek.has(week.id))
    .sort(compareWeeks);
  const latestWeek = rankedWeeks.at(-1) ?? null;
  const previousWeek = rankedWeeks.at(-2) ?? null;
  const latestByTeam = latestWeek
    ? getStatByTeam(statsByWeek.get(latestWeek.id) ?? [])
    : new Map<string, PowerRankingWeeklyStat>();
  const previousByTeam = previousWeek
    ? getStatByTeam(statsByWeek.get(previousWeek.id) ?? [])
    : new Map<string, PowerRankingWeeklyStat>();

  const fallbackRankByTeam = new Map<string, number>();
  for (const stat of seasonStats) {
    const rank = validRank(stat.powerRk);
    if (rank !== null) fallbackRankByTeam.set(stat.gshlTeamId, rank);
  }
  const preseasonByTeam = new Map(
    !latestWeek ? preseason.map((row) => [row.teamId, row]) : [],
  );
  for (const row of preseasonByTeam.values())
    fallbackRankByTeam.set(row.teamId, row.rank);

  const rankedTeams = teams
    .flatMap((team) => {
      const latestStat = latestByTeam.get(team.id);
      const rank =
        validRank(latestStat?.powerRk) ?? fallbackRankByTeam.get(team.id);
      return rank === undefined ? [] : [{ team, latestStat, rank }];
    })
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        (left.team.name ?? "").localeCompare(right.team.name ?? ""),
    );

  const colorByTeam = new Map(
    rankedTeams.map(({ team }, index) => [
      team.id,
      SERIES_COLORS[index % SERIES_COLORS.length] ?? "#475569",
    ]),
  );

  const entries: PowerRankingEntry[] = rankedTeams.map(
    ({ team, latestStat, rank }) => {
      const previousStat = previousByTeam.get(team.id);
      const performance = performanceDisplayRating(latestStat?.powerStatEwma);
      const talent = talentDisplayRating(latestStat?.powerTalent);
      const change = (current: unknown, previous: unknown) => {
        const currentRating = validRating(current);
        const previousRating = validRating(previous);
        return currentRating === null || previousRating === null
          ? null
          : currentRating - previousRating;
      };
      const previousRank = validRank(previousByTeam.get(team.id)?.powerRk);
      return {
        team,
        rank,
        rating: validRating(
          latestStat?.powerRating ?? preseasonByTeam.get(team.id)?.rating,
        ),
        performance,
        elo: latestStat?.powerEloPre ?? null,
        talent,
        ratingChanges: {
          rating: change(latestStat?.powerRating, previousStat?.powerRating),
          performance: change(
            performance,
            performanceDisplayRating(previousStat?.powerStatEwma),
          ),
          elo: change(latestStat?.powerEloPre, previousStat?.powerEloPre),
          talent: change(
            talent,
            talentDisplayRating(previousStat?.powerTalent),
          ),
        },
        previousRank,
        rankChange: previousRank === null ? null : previousRank - rank,
        color: colorByTeam.get(team.id) ?? "#475569",
      };
    },
  );

  const chartData: PowerRankingChartPoint[] = rankedWeeks.map((week) => {
    const point: PowerRankingChartPoint = {
      weekId: week.id,
      weekNum: week.weekNum,
      label: getWeekLabel(week),
    };
    for (const stat of statsByWeek.get(week.id) ?? []) {
      const rank = validRank(stat.powerRk);
      if (rank !== null) point[stat.gshlTeamId] = rank;
    }
    return point;
  });

  return {
    ...(preseasonByTeam.size ? { isPreseason: true } : {}),
    entries,
    regularSeasonLastWeek: Math.max(
      1,
      ...weeks
        .filter((week) => week.weekType === "RS")
        .map((week) => week.weekNum),
    ),
    chartData,
    latestWeek,
    series: entries.map((entry) => ({
      teamId: entry.team.id,
      name: entry.team.name ?? entry.team.abbr ?? "Team",
      abbr: entry.team.abbr ?? entry.team.name?.slice(0, 3) ?? "TM",
      color: entry.color,
      currentRank: entry.rank,
    })),
  };
}

export function buildPowerRankingJourney(
  rankings: PowerRankingsViewModel,
  ownerId?: string | null,
  selectedTeamId?: string | null,
) {
  const focused =
    rankings.entries.find((entry) => entry.team.id === selectedTeamId) ??
    rankings.entries.find(
      (entry) => ownerId && entry.team.ownerId === ownerId,
    ) ??
    rankings.entries[0];
  const lastWeek = rankings.regularSeasonLastWeek ?? 22;
  const chartData = Array.from(
    { length: lastWeek },
    (_, index) =>
      rankings.chartData.find(
        (point) =>
          point.weekNum === index + 1 && point.label === `Week ${index + 1}`,
      ) ?? { weekNum: index + 1 },
  );
  const orderedEntries = [...rankings.entries].sort(
    (a, b) =>
      Number(a.team.id === focused?.team.id) -
      Number(b.team.id === focused?.team.id),
  );
  return { focused, lastWeek, chartData, orderedEntries };
}

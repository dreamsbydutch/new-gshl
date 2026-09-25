import type {
  WeeklyEditionEditorialCandidate,
  WeeklyEditionFactPacket,
  WeeklyEditionResearch,
} from "@gshl-types";

export function teamResultEvidence(
  teams: { teamId: string; name: string }[],
  results: {
    id: string;
    weekNumber: number;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
  }[],
): WeeklyEditionEditorialCandidate[] {
  return teams.flatMap((team) => {
    const games = results
      .filter(
        (game) =>
          (game.homeTeamId === team.teamId ||
            game.awayTeamId === team.teamId) &&
          Number.isFinite(game.homeScore) &&
          Number.isFinite(game.awayScore),
      )
      .sort((a, b) => a.weekNumber - b.weekNumber || a.id.localeCompare(b.id));
    if (!games.length) return [];
    const outcomes = games.map((game) => {
      const margin =
        (game.homeScore - game.awayScore) *
        (game.homeTeamId === team.teamId ? 1 : -1);
      return margin > 0 ? "W" : margin < 0 ? "L" : "T";
    });
    const wins = outcomes.filter((outcome) => outcome === "W").length;
    const losses = outcomes.filter((outcome) => outcome === "L").length;
    const ties = games.length - wins - losses;
    const recent = outcomes.slice(-5);
    return [
      {
        id: `form:${team.teamId}`,
        kind: "trend" as const,
        scope: "season" as const,
        importance: 70,
        teamId: team.teamId,
        teamName: team.name,
        headlineHint: `${team.name}: results and recent form`,
        summary: `${team.name} has ${wins} wins, ${losses} losses and ${ties} ties in ${games.length} completed regular-season matchups through week ${games.at(-1)!.weekNumber}. Latest ${recent.length} results, oldest first: ${recent.join(", ")}. This is a win-loss record, not a category-points standings position.`,
        metrics: [
          { key: "wins", label: "Regular-season wins", value: wins },
          { key: "losses", label: "Regular-season losses", value: losses },
          { key: "ties", label: "Regular-season ties", value: ties },
        ],
        links: [],
      },
    ];
  });
}

export function weeklyStatComparisons(
  teams: { teamId: string; name: string }[],
  current: { gshlTeamId: string; stats: Record<string, unknown> }[],
  previous: { gshlTeamId: string; stats: Record<string, unknown> }[],
  categories: string[],
): WeeklyEditionEditorialCandidate[] {
  const numeric = (value: unknown) =>
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value === "boolean"
      ? undefined
      : Number.isFinite(Number(value))
        ? Number(value)
        : undefined;
  return teams.flatMap((team) => {
    const now = current.find((row) => row.gshlTeamId === team.teamId);
    const before = previous.find((row) => row.gshlTeamId === team.teamId);
    if (!now || !before) return [];
    const metrics = [
      ...new Set([...categories, "Rating", "powerRk", "GP", "MS"]),
    ].flatMap((key) => {
      const value = numeric(now.stats[key]);
      const previousValue = numeric(before.stats[key]);
      return value === undefined || previousValue === undefined
        ? []
        : [{ key, label: key, value, previousValue }];
    });
    if (!metrics.some((metric) => metric.value !== metric.previousValue))
      return [];
    return [
      {
        id: `comparison:${team.teamId}`,
        kind: "trend" as const,
        scope: "week" as const,
        importance: 65,
        teamId: team.teamId,
        teamName: team.name,
        headlineHint: `${team.name}: weekly statistical comparison`,
        summary: `${team.name}, current week compared with the preceding week: ${metrics.map((metric) => `${metric.key} ${metric.previousValue} to ${metric.value}`).join("; ")}. Two weekly samples only; totals may reflect different games played. These changes do not establish a sustained trend or its cause.`,
        metrics,
        links: [],
      },
    ];
  });
}

/** Participation is keyed by people across franchises, never by display names. */
export function ownerParticipation(
  seasons: { id: string; name: string; year: number }[],
  participatedSeasonIds: Set<string>,
  analysisSeasonId: string,
) {
  const ordered = [...seasons].sort(
    (a, b) => a.year - b.year || a.id.localeCompare(b.id),
  );
  const index = ordered.findIndex((season) => season.id === analysisSeasonId);
  const history = ordered
    .slice(0, Math.max(0, index))
    .filter((season) => participatedSeasonIds.has(season.id));
  const last = history.at(-1);
  const absentSeasons = last
    ? index - ordered.findIndex((season) => season.id === last.id) - 1
    : 0;
  return {
    seasons: history,
    absentSeasons,
    status: !last
      ? ("first_recorded_season" as const)
      : absentSeasons > 0
        ? ("returning" as const)
        : ("continuing" as const),
  };
}

/** These are evidence cards, not assigned angles. Writers decide what connects. */
export function researchCandidates(
  packet: WeeklyEditionFactPacket,
  research: WeeklyEditionResearch,
): WeeklyEditionEditorialCandidate[] {
  const candidates: WeeklyEditionEditorialCandidate[] = research.owners.map(
    (owner) => {
      const last = owner.seasons.at(-1);
      return {
        id: `owner-history:${research.analysisSeasonId}:${owner.ownerId}`,
        kind: "owner_history",
        scope: "career",
        importance:
          owner.status === "returning"
            ? 88
            : owner.status === "first_recorded_season"
              ? 75
              : 48,
        teamId: owner.teamId,
        teamName: owner.teamName,
        headlineHint: `${owner.name}: participation and track record`,
        summary: `${owner.name} manages ${owner.teamName}. ${owner.status === "returning" ? `Last recorded participation was ${last!.name}; absent for ${owner.absentSeasons} intervening league season(s).` : owner.status === "first_recorded_season" ? "No earlier participation is present in the available team records; this does not establish a first-ever season." : `Also participated in ${last!.name}.`} ${owner.ranking ? `As of the completed seasons in this snapshot, GM Ladder rank ${owner.ranking.rank}, rating ${owner.ranking.rating}, record ${owner.ranking.overallWins}-${owner.ranking.overallLosses}, ${owner.ranking.cups} cups.` : "GM Ladder rank unavailable in this snapshot."}`,
        metrics: [
          {
            key: "absentSeasons",
            label: "Intervening seasons without a team record",
            value: owner.absentSeasons,
          },
          ...(owner.ranking
            ? [
                {
                  key: "gmRank",
                  label: "Historical GM Ladder rank",
                  value: owner.ranking.rank,
                },
              ]
            : []),
        ],
        links: [],
      };
    },
  );
  for (const matchup of packet.nextMatchups.filter(
    (row) => row.gameType !== "LT",
  )) {
    const owners = research.owners.filter(
      (owner) =>
        owner.teamId === matchup.homeTeamId ||
        owner.teamId === matchup.awayTeamId,
    );
    candidates.push({
      id: `upcoming:${matchup.matchupId}`,
      kind: "upcoming_matchup",
      scope: "week",
      importance: 66,
      occurredAt: matchup.startDate,
      relatedTeamIds: [matchup.homeTeamId, matchup.awayTeamId].filter(
        (id): id is string => Boolean(id),
      ),
      headlineHint: `${matchup.awayTeamName} at ${matchup.homeTeamName}`,
      summary: `Scheduled, not a completed result: ${matchup.awayTeamName} at ${matchup.homeTeamName}${matchup.startDate ? `, week beginning ${matchup.startDate}` : ""}. ${owners.map((owner) => `${owner.name} manages ${owner.teamName}`).join("; ")}.`,
      metrics: [],
      links: [],
    });
  }
  return candidates;
}

/** Reserve room across subjects before filling with the highest rated evidence. */
export function selectResearchEvidence(
  candidates: WeeklyEditionEditorialCandidate[],
  limit = 120,
) {
  const sorted = [
    ...new Map(candidates.map((row) => [row.id, row])).values(),
  ].sort((a, b) => b.importance - a.importance || a.id.localeCompare(b.id));
  const selected = new Map<string, WeeklyEditionEditorialCandidate>();
  const groups = new Set<string>();
  for (const row of sorted) {
    const group = `${row.kind}:${row.teamId ?? row.relatedTeamIds?.join(":") ?? "league"}`;
    if (!groups.has(group) && selected.size < limit) {
      groups.add(group);
      selected.set(row.id, row);
    }
  }
  for (const row of sorted) {
    if (selected.size >= limit) break;
    selected.set(row.id, row);
  }
  return [...selected.values()].sort(
    (a, b) => b.importance - a.importance || a.id.localeCompare(b.id),
  );
}

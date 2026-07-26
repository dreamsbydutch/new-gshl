import { z } from "zod";
import type {
  BuildWeeklyEditionFactPacketInput,
  BuildWeeklyEditionCategoryMarginsInput,
  BuildMilestoneEditionFactPacketInput,
  WeeklyEditionContent,
  WeeklyEditionFactPacket,
  WeeklyEditionMatchupFact,
  WeeklyEditionMilestoneScheduleEntry,
  WeeklyEditionMilestoneScheduleInput,
  WeeklyEditionSection,
  WeeklyEditionSectionKind,
  WeeklyEditionValidationResult,
} from "@gshl-types";

export const WEEKLY_EDITION_SECTION_KINDS = [
  "biggest_story",
  "matchup_roundup",
  "three_stars",
  "power_movers",
  "transaction_wire",
  "missed_start",
  "next_week",
  "season_recap",
  "expiring_contracts",
  "cap_space",
  "roster_outlook",
  "ufa_market",
  "draft_capital",
  "season_predictions",
] as const satisfies readonly WeeklyEditionSectionKind[];

export const WEEKLY_EDITION_ISSUE_LABELS = {
  weekly: "Weekly Recap",
  final_recap: "Final Recap",
  resigning_outlook: "Re-signing Outlook",
  offseason_market: "Offseason Market",
  pre_draft: "Pre-Draft Issue",
  preseason: "Preseason Preview",
} as const;

function shiftEditionDate(value: string, days: number) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildWeeklyEditionMilestoneSchedule({
  finalWeekEnd,
  signingEndDate,
  draftStartAt,
}: WeeklyEditionMilestoneScheduleInput): WeeklyEditionMilestoneScheduleEntry[] {
  const draftDate = String(draftStartAt ?? "").slice(0, 10);
  return [
    {
      issueType: "final_recap" as const,
      issueLabel: WEEKLY_EDITION_ISSUE_LABELS.final_recap,
      scheduledFor: finalWeekEnd.slice(0, 10),
    },
    {
      issueType: "resigning_outlook" as const,
      issueLabel: WEEKLY_EDITION_ISSUE_LABELS.resigning_outlook,
      scheduledFor: shiftEditionDate(finalWeekEnd, 7),
    },
    {
      issueType: "offseason_market" as const,
      issueLabel: WEEKLY_EDITION_ISSUE_LABELS.offseason_market,
      scheduledFor: String(signingEndDate ?? "").slice(0, 10),
    },
    {
      issueType: "pre_draft" as const,
      issueLabel: WEEKLY_EDITION_ISSUE_LABELS.pre_draft,
      scheduledFor: shiftEditionDate(draftDate, -7),
    },
    {
      issueType: "preseason" as const,
      issueLabel: WEEKLY_EDITION_ISSUE_LABELS.preseason,
      scheduledFor: shiftEditionDate(draftDate, 1),
    },
  ].filter((item) => item.scheduledFor);
}

const sectionKindSchema = z.enum(WEEKLY_EDITION_SECTION_KINDS);
const linkSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    href: z.string().trim().min(1).max(200),
  })
  .strict();
const sectionSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    kind: sectionKindSchema,
    eyebrow: z.string().trim().min(1).max(40),
    headline: z.string().trim().min(1).max(110),
    body: z.string().trim().min(1).max(900),
    links: z.array(linkSchema).max(4),
  })
  .strict();
const contentSchema = z
  .object({
    headline: z.string().trim().min(1).max(110),
    deck: z.string().trim().min(1).max(240),
    sections: z.array(sectionSchema).min(5).max(7),
  })
  .strict();

const numberValue = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const optionalNumber = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const INVERSE_CATEGORIES = new Set(["GAA"]);

export function buildWeeklyEditionCategoryMargins({
  categories,
  homeTeamName,
  awayTeamName,
  homeStats,
  awayStats,
}: BuildWeeklyEditionCategoryMarginsInput) {
  return categories
    .map((category) => {
      const homeValue = optionalNumber(homeStats[category]);
      const awayValue = optionalNumber(awayStats[category]);
      if (homeValue === undefined || awayValue === undefined) return null;
      const inverse = INVERSE_CATEGORIES.has(category.toUpperCase());
      const homeWon = inverse ? homeValue < awayValue : homeValue > awayValue;
      const awayWon = inverse ? awayValue < homeValue : awayValue > homeValue;
      return {
        category,
        homeValue,
        awayValue,
        winnerTeamName: homeWon
          ? homeTeamName
          : awayWon
            ? awayTeamName
            : undefined,
        margin: Math.abs(homeValue - awayValue),
        inverse,
      };
    })
    .filter((item) => item !== null)
    .sort(
      (left, right) =>
        right.margin - left.margin ||
        left.category.localeCompare(right.category),
    );
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value?.constructor === Object) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function hashWeeklyEditionSource(value: unknown) {
  const text = JSON.stringify(stableValue(value));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function winnerForMatchup(
  matchup: Omit<WeeklyEditionMatchupFact, "rankUpset">,
): WeeklyEditionMatchupFact {
  const homeWon = matchup.homeScore > matchup.awayScore;
  const awayWon = matchup.awayScore > matchup.homeScore;
  const winnerTeamId = homeWon
    ? matchup.homeTeamId
    : awayWon
      ? matchup.awayTeamId
      : undefined;
  const winnerTeamName = homeWon
    ? matchup.homeTeamName
    : awayWon
      ? matchup.awayTeamName
      : undefined;
  const loserTeamId = homeWon
    ? matchup.awayTeamId
    : awayWon
      ? matchup.homeTeamId
      : undefined;
  const loserTeamName = homeWon
    ? matchup.awayTeamName
    : awayWon
      ? matchup.homeTeamName
      : undefined;
  const winnerRank = homeWon ? matchup.homeRank : matchup.awayRank;
  const loserRank = homeWon ? matchup.awayRank : matchup.homeRank;
  const rankUpset =
    winnerRank !== undefined && loserRank !== undefined
      ? Math.max(0, winnerRank - loserRank)
      : 0;
  return {
    ...matchup,
    winnerTeamId,
    winnerTeamName,
    loserTeamId,
    loserTeamName,
    rankUpset,
  };
}

function selectHeroMatchup(matchups: WeeklyEditionMatchupFact[]) {
  return [...matchups].sort((left, right) => {
    if (right.rankUpset !== left.rankUpset)
      return right.rankUpset - left.rankUpset;
    const ratingDifference =
      (right.competitiveRating ?? 0) - (left.competitiveRating ?? 0);
    if (ratingDifference !== 0) return ratingDifference;
    const leftMargin = Math.abs(left.homeScore - left.awayScore);
    const rightMargin = Math.abs(right.homeScore - right.awayScore);
    if (leftMargin !== rightMargin) return leftMargin - rightMargin;
    return left.matchupId.localeCompare(right.matchupId);
  })[0];
}

function collectAllowedNumbers(
  packet: Omit<WeeklyEditionFactPacket, "allowedNumbers">,
) {
  const values = new Set<string>([
    "0",
    "1",
    "2",
    "3",
    String(packet.week.number),
    packet.season.year,
  ]);
  packet.teams.forEach((_team, index) => values.add(String(index + 1)));
  const visit = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      values.add(String(value));
      values.add(value.toFixed(1));
      values.add(value.toFixed(2));
      values.add((value / 1_000_000).toFixed(1));
    } else if (typeof value === "string") {
      (value.match(/-?\d+(?:\.\d+)?/g) ?? []).forEach((number) => {
        values.add(number);
        values.add(number.replace(/^-/, ""));
      });
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  visit(packet);
  return [...values].sort();
}

export function buildWeeklyEditionFactPacket(
  input: BuildWeeklyEditionFactPacketInput,
): WeeklyEditionFactPacket {
  const matchups = input.matchups.map(winnerForMatchup);
  const hero = selectHeroMatchup(matchups);
  if (!hero) throw new Error("A completed matchup is required");

  const stars = input.players
    .map((player) => ({
      playerId: player.playerId,
      playerName: player.playerName,
      teamId: player.teamId,
      teamName: player.teamName,
      rating: numberValue(player.rating),
      points: numberValue(player.points),
      wins: numberValue(player.wins),
    }))
    .sort(
      (left, right) =>
        right.rating - left.rating ||
        right.points - left.points ||
        right.wins - left.wins ||
        left.playerName.localeCompare(right.playerName),
    )
    .slice(0, 3);

  const powerMovers = input.power
    .map((team) => {
      const currentRank = numberValue(team.currentRank);
      const previousRank = numberValue(team.previousRank);
      const currentElo = optionalNumber(team.currentElo);
      const previousElo = optionalNumber(team.previousElo);
      return {
        teamId: team.teamId,
        teamName: team.teamName,
        currentRank,
        previousRank,
        rankChange: previousRank - currentRank,
        currentElo,
        eloChange:
          currentElo !== undefined && previousElo !== undefined
            ? currentElo - previousElo
            : undefined,
      };
    })
    .filter((team) => team.currentRank > 0 && team.previousRank > 0)
    .sort(
      (left, right) =>
        Math.abs(right.rankChange) - Math.abs(left.rankChange) ||
        right.rankChange - left.rankChange ||
        left.teamName.localeCompare(right.teamName),
    )
    .slice(0, 4);

  const allowedNames = new Set<string>();
  const addName = (name: string | undefined) => {
    if (name?.trim()) allowedNames.add(name.trim());
  };
  input.teams.forEach((team) => addName(team.name));
  matchups.forEach((matchup) => {
    addName(matchup.homeTeamName);
    addName(matchup.awayTeamName);
  });
  stars.forEach((star) => {
    addName(star.playerName);
    addName(star.teamName);
  });
  powerMovers.forEach((mover) => addName(mover.teamName));
  input.activity.forEach((event) => {
    addName(event.playerName);
    addName(event.teamName);
  });
  input.missedStarts.forEach((event) => {
    addName(event.playerName);
    addName(event.teamName);
  });
  input.nextMatchups.forEach((matchup) => {
    addName(matchup.homeTeamName);
    addName(matchup.awayTeamName);
  });

  const withoutNumbers = {
    version: 1 as const,
    season: input.season,
    week: input.week,
    teams: [...input.teams].sort((a, b) => a.name.localeCompare(b.name)),
    matchups,
    heroMatchupId: hero.matchupId,
    stars,
    powerMovers,
    activity: [...input.activity].sort((a, b) => a.date.localeCompare(b.date)),
    missedStarts: [...input.missedStarts].sort(
      (a, b) => b.count - a.count || a.playerName.localeCompare(b.playerName),
    ),
    nextMatchups: input.nextMatchups,
    knownEntityNames: [...new Set(input.knownEntityNames)].sort(),
    allowedNames: [...allowedNames].sort(),
    issueType: "weekly" as const,
    issueLabel: `Week ${input.week.number}`,
  };
  return {
    ...withoutNumbers,
    allowedNumbers: collectAllowedNumbers(withoutNumbers),
  };
}

export function buildMilestoneEditionFactPacket(
  input: BuildMilestoneEditionFactPacketInput,
): WeeklyEditionFactPacket {
  const matchups = (input.matchups ?? []).map(winnerForMatchup);
  const hero = matchups.length > 0 ? selectHeroMatchup(matchups) : undefined;
  const stars = (input.stars ?? [])
    .map((player) => ({
      playerId: player.playerId,
      playerName: player.playerName,
      teamId: player.teamId,
      teamName: player.teamName,
      rating: numberValue(player.rating),
      points: numberValue(player.points),
      wins: numberValue(player.wins),
    }))
    .sort((left, right) => right.rating - left.rating)
    .slice(0, 3);
  const powerMovers = (input.power ?? [])
    .map((team) => {
      const currentRank = numberValue(team.currentRank);
      const previousRank = numberValue(team.previousRank);
      const currentElo = optionalNumber(team.currentElo);
      const previousElo = optionalNumber(team.previousElo);
      return {
        teamId: team.teamId,
        teamName: team.teamName,
        currentRank,
        previousRank,
        rankChange: previousRank - currentRank,
        currentElo,
        eloChange:
          currentElo !== undefined && previousElo !== undefined
            ? currentElo - previousElo
            : undefined,
      };
    })
    .sort((left, right) => left.currentRank - right.currentRank);
  const allowedNames = new Set<string>();
  input.teams.forEach((team) => allowedNames.add(team.name));
  input.teamOutlooks.forEach((team) => allowedNames.add(team.teamName));
  input.expiringContracts.forEach((contract) => {
    allowedNames.add(contract.playerName);
    allowedNames.add(contract.teamName);
  });
  input.recentSignings.forEach((contract) => {
    allowedNames.add(contract.playerName);
    allowedNames.add(contract.teamName);
  });
  input.draftPicks.forEach((pick) => {
    allowedNames.add(pick.teamName);
    if (pick.selectedPlayerName) allowedNames.add(pick.selectedPlayerName);
  });
  stars.forEach((star) => allowedNames.add(star.playerName));

  const withoutNumbers = {
    version: 1 as const,
    season: input.season,
    week: input.week,
    teams: input.teams,
    matchups,
    heroMatchupId: hero?.matchupId,
    stars,
    powerMovers,
    activity: [],
    missedStarts: [],
    nextMatchups: [],
    knownEntityNames: [...new Set(input.knownEntityNames)].sort(),
    allowedNames: [...allowedNames].sort(),
    issueType: input.issueType,
    issueLabel: input.issueLabel,
    milestone: {
      triggerDate: input.triggerDate,
      salaryCap: 25_000_000,
      teamOutlooks: [...input.teamOutlooks].sort(
        (left, right) =>
          right.rosterTalent - left.rosterTalent ||
          left.teamName.localeCompare(right.teamName),
      ),
      expiringContracts: [...input.expiringContracts].sort(
        (left, right) =>
          right.salary - left.salary ||
          left.playerName.localeCompare(right.playerName),
      ),
      recentSignings: [...input.recentSignings].sort(
        (left, right) =>
          right.salary - left.salary ||
          left.playerName.localeCompare(right.playerName),
      ),
      draftPicks: [...input.draftPicks].sort(
        (left, right) =>
          left.round - right.round || (left.pick ?? 999) - (right.pick ?? 999),
      ),
    },
  };
  return {
    ...withoutNumbers,
    allowedNumbers: collectAllowedNumbers(withoutNumbers),
  };
}

function choose<T>(
  packet: WeeklyEditionFactPacket,
  values: readonly T[],
  salt: string,
) {
  const hash = Number.parseInt(
    hashWeeklyEditionSource(`${packet.season.id}:${packet.week.id}:${salt}`),
    16,
  );
  return values[hash % values.length]!;
}

function scoreline(matchup: WeeklyEditionMatchupFact) {
  return `${matchup.awayTeamName} ${matchup.awayScore}–${matchup.homeScore} ${matchup.homeTeamName}`;
}

function matchupSummary(matchup: WeeklyEditionMatchupFact) {
  const categoryNote = matchup.categoryMargins.find(
    (category) => category.winnerTeamName === matchup.winnerTeamName,
  );
  const categorySentence = categoryNote
    ? ` ${categoryNote.winnerTeamName} created its widest category edge in ${categoryNote.category}, ${categoryNote.homeValue}–${categoryNote.awayValue}.`
    : "";
  if (!matchup.winnerTeamName) {
    return `${matchup.homeTeamName} and ${matchup.awayTeamName} finished level at ${matchup.homeScore}–${matchup.awayScore}.`;
  }
  return `${matchup.winnerTeamName} beat ${matchup.loserTeamName} ${Math.max(matchup.homeScore, matchup.awayScore)}–${Math.min(matchup.homeScore, matchup.awayScore)}.${categorySentence}`;
}

function section(
  kind: WeeklyEditionSectionKind,
  eyebrow: string,
  headline: string,
  body: string,
  links: WeeklyEditionSection["links"],
): WeeklyEditionSection {
  return { id: kind, kind, eyebrow, headline, body, links };
}

export function buildTemplateWeeklyEdition(
  packet: WeeklyEditionFactPacket,
): WeeklyEditionContent {
  if (packet.issueType !== "weekly") {
    return buildMilestoneTemplateEdition(packet);
  }
  const hero =
    packet.matchups.find(
      (matchup) => matchup.matchupId === packet.heroMatchupId,
    ) ?? packet.matchups[0]!;
  const upsetHeadline =
    hero.rankUpset > 0 && hero.winnerTeamName
      ? choose(
          packet,
          [
            `${hero.winnerTeamName} flips the script`,
            `${hero.winnerTeamName} delivers the week’s shock`,
            `Rankings meet reality: ${hero.winnerTeamName} wins`,
          ],
          "lead",
        )
      : choose(
          packet,
          [
            `${hero.homeTeamName} and ${hero.awayTeamName} own the spotlight`,
            `A week decided at the margins`,
            `${hero.winnerTeamName ?? hero.homeTeamName} headlines Week ${packet.week.number}`,
          ],
          "lead",
        );
  const deck = `${scoreline(hero)} led a Week ${packet.week.number} slate with ${packet.matchups.length} completed matchup${packet.matchups.length === 1 ? "" : "s"}.`;
  const sections: WeeklyEditionSection[] = [
    section(
      "biggest_story",
      "Biggest Story",
      upsetHeadline,
      `${matchupSummary(hero)} ${
        hero.rankUpset > 0
          ? `The winner entered ${hero.rankUpset} ranking spot${hero.rankUpset === 1 ? "" : "s"} behind the opposition, which is exactly why the standings never get the final word.`
          : "It was the week’s most competitive result, and neither side left much room for a comfortable Sunday night."
      }`,
      [{ label: "Open matchup", href: `/matchup/${hero.matchupId}` }],
    ),
    section(
      "matchup_roundup",
      "Matchup Roundup",
      choose(
        packet,
        ["Around the league", "The rest of the scores", "How the week was won"],
        "roundup",
      ),
      packet.matchups.map(matchupSummary).join(" "),
      [{ label: "View schedule", href: "/schedule" }],
    ),
    section(
      "three_stars",
      "Three Stars",
      packet.stars.length > 0
        ? `${packet.stars[0]!.playerName} leads the weekly podium`
        : "The weekly podium",
      packet.stars.length > 0
        ? packet.stars
            .map(
              (star, index) =>
                `${index + 1}. ${star.playerName} (${star.teamName}) — ${star.rating.toFixed(2)} rating, ${star.points} points and ${star.wins} wins.`,
            )
            .join(" ")
        : "No eligible weekly player ratings were available.",
      [],
    ),
    section(
      "power_movers",
      "Power Movers",
      packet.powerMovers.some((mover) => mover.rankChange !== 0)
        ? "The ladder did not sit still"
        : "The ladder holds its shape",
      packet.powerMovers.length > 0
        ? packet.powerMovers
            .map((mover) => {
              const direction =
                mover.rankChange > 0
                  ? `up ${mover.rankChange}`
                  : mover.rankChange < 0
                    ? `down ${Math.abs(mover.rankChange)}`
                    : "unchanged";
              return `${mover.teamName} is No. ${mover.currentRank} (${direction}).`;
            })
            .join(" ")
        : "No week-over-week power ranking comparison was available.",
      [{ label: "View standings", href: "/standings" }],
    ),
  ];

  if (packet.activity.length > 0) {
    sections.push(
      section(
        "transaction_wire",
        "Transaction Wire",
        "The roster carousel keeps turning",
        packet.activity
          .slice(0, 8)
          .map(
            (event) =>
              `${event.teamName}: ${event.kind} ${event.playerName}${event.detail ? ` (${event.detail})` : ""}.`,
          )
          .join(" "),
        [],
      ),
    );
  }
  if (packet.missedStarts.length > 0) {
    const missed = packet.missedStarts[0]!;
    sections.push(
      section(
        "missed_start",
        "Missed-Start Moment",
        `${missed.teamName} leaves one on the bench`,
        `${missed.playerName} recorded ${missed.count} missed start${missed.count === 1 ? "" : "s"} for ${missed.teamName}. A gentle reminder that the best lineup is usually the one that gets submitted.`,
        [],
      ),
    );
  }
  sections.push(
    section(
      "next_week",
      "Next Week Preview",
      packet.nextMatchups.length > 0
        ? `${packet.nextMatchups[0]!.awayTeamName} meets ${packet.nextMatchups[0]!.homeTeamName}`
        : "The next puck drop awaits",
      packet.nextMatchups.length > 0
        ? packet.nextMatchups
            .map(
              (matchup) =>
                `${matchup.awayTeamName} at ${matchup.homeTeamName}${matchup.awayRank && matchup.homeRank ? ` pairs No. ${matchup.awayRank} with No. ${matchup.homeRank}` : ""}.`,
            )
            .join(" ")
        : "The next slate has not been posted yet. Check the schedule when the matchups lock in.",
      [{ label: "See next week", href: "/schedule" }],
    ),
  );

  return { headline: upsetHeadline, deck, sections };
}

function money(value: number) {
  return `$${(value / 1_000_000).toFixed(1)}M`;
}

function teamOutlookSummary(packet: WeeklyEditionFactPacket) {
  return (
    packet.milestone?.teamOutlooks
      .slice(0, 6)
      .map(
        (team) =>
          `${team.teamName}: ${money(team.capSpace)} in cap space, ${team.rosterSize} rostered players and a ${team.rosterTalent.toFixed(1)} talent rating.`,
      )
      .join(" ") ?? "Team outlook data is still being assembled."
  );
}

function buildMilestoneTemplateEdition(
  packet: WeeklyEditionFactPacket,
): WeeklyEditionContent {
  const facts = packet.milestone;
  if (!facts) throw new Error("Milestone facts are required");
  const topTeam = facts.teamOutlooks[0];
  const capLeader = [...facts.teamOutlooks].sort(
    (left, right) => right.capSpace - left.capSpace,
  )[0];
  const draftLeader = [...facts.teamOutlooks].sort(
    (left, right) =>
      right.draftPickCount - left.draftPickCount ||
      right.firstRoundPickCount - left.firstRoundPickCount,
  )[0];
  const expiring = facts.expiringContracts.slice(0, 8);
  const signings = facts.recentSignings.slice(0, 8);
  const standingsLink = [{ label: "View standings", href: "/standings" }];

  if (packet.issueType === "final_recap") {
    const hero = packet.matchups.find(
      (matchup) => matchup.matchupId === packet.heroMatchupId,
    );
    const headline = hero?.winnerTeamName
      ? `${hero.winnerTeamName} puts the final stamp on ${packet.season.name}`
      : `${packet.season.name}: the final word`;
    return {
      headline,
      deck: `The season is complete. GSHL Weekly looks back at the final results, standout players and the pecking order the league carries into the offseason.`,
      sections: [
        section(
          "season_recap",
          "Final Recap",
          headline,
          hero
            ? `${matchupSummary(hero)} It was the closing result in a season that rarely followed the tidy version of the script.`
            : "The final week is in the books and the season ledger is closed.",
          hero
            ? [
                {
                  label: "Open final matchup",
                  href: `/matchup/${hero.matchupId}`,
                },
              ]
            : standingsLink,
        ),
        section(
          "three_stars",
          "Season Finishers",
          packet.stars[0]
            ? `${packet.stars[0].playerName} finishes in style`
            : "The last stars of the season",
          packet.stars
            .map(
              (star, index) =>
                `${index + 1}. ${star.playerName} (${star.teamName}) — ${star.rating.toFixed(2)} rating.`,
            )
            .join(" ") || "Final player ratings were unavailable.",
          [],
        ),
        section(
          "roster_outlook",
          "Where They Stand",
          topTeam
            ? `${topTeam.teamName} carries the strongest talent mark`
            : "The offseason starting line",
          teamOutlookSummary(packet),
          standingsLink,
        ),
        section(
          "expiring_contracts",
          "What Comes Next",
          `${facts.expiringContracts.length} expiring contract${facts.expiringContracts.length === 1 ? "" : "s"} shape the next chapter`,
          expiring
            .map(
              (contract) =>
                `${contract.teamName} has ${contract.playerName} (${money(contract.salary)}, ${contract.expiryStatus}) approaching expiry.`,
            )
            .join(" ") || "No expiring contracts were found.",
          [],
        ),
        section(
          "next_week",
          "Next Edition",
          "The re-signing questions are coming",
          "GSHL Weekly returns one week after the final with a team-by-team look at expiring contracts, cap room and the decisions that will define the summer.",
          [],
        ),
      ],
    };
  }

  if (packet.issueType === "resigning_outlook") {
    const lead = expiring[0];
    return {
      headline: lead
        ? `${lead.teamName} faces the summer’s first big call`
        : "The re-signing board is open",
      deck: `${facts.expiringContracts.length} expiring contracts meet a $25.0M hard cap. Here are the decisions, pressure points and roster holes facing every front office.`,
      sections: [
        section(
          "expiring_contracts",
          "Re-signing Spotlight",
          lead
            ? `${lead.playerName} leads the decision list`
            : "The decision list",
          expiring
            .map(
              (contract) =>
                `${contract.teamName}: ${contract.playerName}, ${money(contract.salary)}, ${contract.expiryStatus}.`,
            )
            .join(" ") || "No expiring contracts were found.",
          [],
        ),
        section(
          "cap_space",
          "Cap Space",
          capLeader
            ? `${capLeader.teamName} has the most room to work`
            : "Every dollar has a destination",
          [...facts.teamOutlooks]
            .sort((left, right) => right.capSpace - left.capSpace)
            .map(
              (team) =>
                `${team.teamName} has ${money(team.capSpace)} available with ${team.expiringCount} expiring contract${team.expiringCount === 1 ? "" : "s"}.`,
            )
            .join(" "),
          [],
        ),
        section(
          "roster_outlook",
          "Roster Pressure",
          "Who can afford to stand pat?",
          teamOutlookSummary(packet),
          [],
        ),
        section(
          "ufa_market",
          "Potential Market",
          "Today’s unsigned questions become tomorrow’s UFA board",
          "Teams with both cap room and roster openings can be aggressive. Teams near the ceiling will need their pencils—and perhaps their group chats—working overtime.",
          [],
        ),
        section(
          "next_week",
          "Dates to Know",
          `The signing window closes ${packet.season.signingEndDate ?? facts.triggerDate}`,
          "When the deadline arrives, the newspaper will reset the market and identify which teams can make the loudest UFA moves.",
          [],
        ),
      ],
    };
  }

  if (packet.issueType === "offseason_market") {
    return {
      headline: capLeader
        ? `${capLeader.teamName} enters UFA season with room to swing`
        : "The offseason market is open",
      deck: `The signing deadline has passed. Cap space, completed deals and open roster spots now tell us which teams can shape the UFA market.`,
      sections: [
        section(
          "ufa_market",
          "UFA Market",
          "The teams with money to spend",
          [...facts.teamOutlooks]
            .sort((left, right) => right.capSpace - left.capSpace)
            .map(
              (team) =>
                `${team.teamName}: ${money(team.capSpace)} available and ${team.rosterSize} players currently rostered.`,
            )
            .join(" "),
          [],
        ),
        section(
          "transaction_wire",
          "Deals Already Done",
          signings[0]
            ? `${signings[0].playerName} tops the early signing board`
            : "The early signing board",
          signings
            .map(
              (contract) =>
                `${contract.teamName} signed ${contract.playerName} at ${money(contract.salary)}.`,
            )
            .join(" ") || "No completed signings were found in this window.",
          [],
        ),
        section(
          "cap_space",
          "Buying Power",
          "Room is useful; roster fit decides what comes next",
          teamOutlookSummary(packet),
          [],
        ),
        section(
          "roster_outlook",
          "Early Contenders",
          topTeam
            ? `${topTeam.teamName} owns the early talent lead`
            : "The early roster picture",
          teamOutlookSummary(packet),
          standingsLink,
        ),
        section(
          "next_week",
          "Next Stop",
          "The draft board is waiting",
          "One week before draft night, GSHL Weekly will count the picks, identify the teams with leverage and map the biggest roster needs.",
          [],
        ),
      ],
    };
  }

  if (packet.issueType === "pre_draft") {
    return {
      headline: draftLeader
        ? `${draftLeader.teamName} brings the biggest stack to draft night`
        : "The GSHL draft board is set",
      deck: `${facts.draftPicks.length} picks are on the board. We break down draft capital, first-round leverage and the roster needs each team can attack.`,
      sections: [
        section(
          "draft_capital",
          "Draft Capital",
          draftLeader
            ? `${draftLeader.teamName} controls the board`
            : "Who controls the board?",
          [...facts.teamOutlooks]
            .sort(
              (left, right) =>
                right.draftPickCount - left.draftPickCount ||
                right.firstRoundPickCount - left.firstRoundPickCount,
            )
            .map(
              (team) =>
                `${team.teamName}: ${team.draftPickCount} picks, including ${team.firstRoundPickCount} in Round 1.`,
            )
            .join(" "),
          [],
        ),
        section(
          "roster_outlook",
          "Needs Board",
          "Picks are only useful when they answer a question",
          teamOutlookSummary(packet),
          [],
        ),
        section(
          "cap_space",
          "Post-Draft Flexibility",
          capLeader
            ? `${capLeader.teamName} can still shop after the podium`
            : "Cap room after the podium",
          teamOutlookSummary(packet),
          [],
        ),
        section(
          "ufa_market",
          "Trade Watch",
          "Draft capital creates options",
          "Teams with extra selections can move around the board; teams with thinner pick totals may need to choose certainty over volume.",
          [],
        ),
        section(
          "next_week",
          "Draft Countdown",
          `The draft begins ${packet.season.draftStartAt ?? facts.triggerDate}`,
          "Once the board is complete, the preseason issue will grade the fully formed rosters and make the predictions everyone can screenshot for later.",
          [],
        ),
      ],
    };
  }

  return {
    headline: topTeam
      ? `${topTeam.teamName} opens as the team to catch`
      : "The new GSHL season takes shape",
    deck: `The draft is complete and the rosters are formed. Talent ratings, cap construction and team depth point to the contenders—and the teams ready to surprise.`,
    sections: [
      section(
        "season_predictions",
        "Preseason Predictions",
        topTeam
          ? `${topTeam.teamName} earns the opening favourite tag`
          : "The opening forecast",
        teamOutlookSummary(packet),
        standingsLink,
      ),
      section(
        "roster_outlook",
        "Roster Rankings",
        "Talent on paper, before the chaos begins",
        facts.teamOutlooks
          .map(
            (team, index) =>
              `${index + 1}. ${team.teamName} — ${team.rosterTalent.toFixed(1)} talent rating across ${team.rosterSize} players.`,
          )
          .join(" "),
        [],
      ),
      section(
        "draft_capital",
        "New Faces",
        "The picks that changed the depth chart",
        facts.draftPicks
          .filter((pick) => pick.selectedPlayerName)
          .slice(0, 10)
          .map(
            (pick) =>
              `${pick.teamName} selected ${pick.selectedPlayerName} in Round ${pick.round}.`,
          )
          .join(" ") || "Completed draft selections were not available.",
        [],
      ),
      section(
        "cap_space",
        "Flexibility",
        capLeader
          ? `${capLeader.teamName} keeps the largest cushion`
          : "Who kept room for the unexpected?",
        teamOutlookSummary(packet),
        [],
      ),
      section(
        "next_week",
        "Puck Drop",
        "Predictions end where the games begin",
        "The next edition returns after Week 1 with actual results, actual movement and the first opportunities to pretend the preseason predictions never happened.",
        [{ label: "View schedule", href: "/schedule" }],
      ),
    ],
  };
}

function allText(content: WeeklyEditionContent) {
  return [
    content.headline,
    content.deck,
    ...content.sections.flatMap((item) => [
      item.eyebrow,
      item.headline,
      item.body,
      ...item.links.map((link) => link.label),
    ]),
  ].join("\n");
}

function formatZodErrors(error: z.ZodError) {
  return error.issues.map(
    (issue) => `${issue.path.join(".") || "response"}: ${issue.message}`,
  );
}

export function validateWeeklyEditionContent(
  value: unknown,
  packet: WeeklyEditionFactPacket,
): WeeklyEditionValidationResult {
  const parsed = contentSchema.safeParse(value);
  if (!parsed.success)
    return { valid: false, errors: formatZodErrors(parsed.error) };

  const errors: string[] = [];
  const content = parsed.data;
  const text = allText(content);
  if (/<\/?[a-z][^>]*>/i.test(text))
    errors.push("HTML is not allowed in edition copy.");

  const expected = buildTemplateWeeklyEdition(packet);
  const expectedById = new Map(
    expected.sections.map((item) => [item.id, item]),
  );
  const seen = new Set<string>();
  for (const item of content.sections) {
    if (seen.has(item.id)) errors.push(`Duplicate section ID: ${item.id}.`);
    seen.add(item.id);
    const expectedSection = expectedById.get(item.id);
    if (expectedSection?.kind !== item.kind) {
      errors.push(`Unsupported section or kind: ${item.id}.`);
      continue;
    }
    if (JSON.stringify(item.links) !== JSON.stringify(expectedSection.links))
      errors.push(`Links in ${item.id} must match the verified fact packet.`);
  }
  for (const expectedSection of expected.sections) {
    if (!seen.has(expectedSection.id))
      errors.push(`Missing required section: ${expectedSection.id}.`);
  }

  for (const entityName of packet.knownEntityNames) {
    if (
      !packet.allowedNames.includes(entityName) &&
      text.toLocaleLowerCase().includes(entityName.toLocaleLowerCase())
    ) {
      errors.push(`Unsupported league name: ${entityName}.`);
    }
  }

  const numberClaims = text.match(/(?<![\w/])-?\d+(?:\.\d+)?/g) ?? [];
  const allowedNumbers = new Set(packet.allowedNumbers);
  for (const claim of new Set(numberClaims)) {
    if (!allowedNumbers.has(claim))
      errors.push(`Unsupported numeric claim: ${claim}.`);
  }
  return {
    valid: errors.length === 0,
    errors,
    content: errors.length === 0 ? content : undefined,
  };
}

export function validateWeeklyEditionImport(
  raw: string,
  packet: WeeklyEditionFactPacket,
): WeeklyEditionValidationResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {
      valid: false,
      errors: ["The response is not valid JSON. Paste only the JSON object."],
    };
  }
  return validateWeeklyEditionContent(value, packet);
}

export function buildWeeklyEditionChatGptPrompt(
  packet: WeeklyEditionFactPacket,
) {
  const template = buildTemplateWeeklyEdition(packet);
  return [
    "You are the editor of GSHL Weekly, a friendly fantasy-hockey league newspaper.",
    "Rewrite the supplied edition with energetic, concise sportswriting and gentle chirps. Never insult a person, speculate about motives, or add facts.",
    "Use only the names, numbers, outcomes, and links in FACT_PACKET. Do not add HTML, Markdown links, new sections, new IDs, or new URLs.",
    "Return only one JSON object matching RESPONSE_SHAPE. Keep every section id, kind, and links value exactly unchanged.",
    "Limits: headline 110 characters; deck 240; section headline 110; section body 900; eyebrow 40.",
    "",
    `FACT_PACKET=${JSON.stringify(packet, null, 2)}`,
    "",
    `RESPONSE_SHAPE=${JSON.stringify(template, null, 2)}`,
  ].join("\n");
}

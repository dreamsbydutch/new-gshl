import type {
  WeeklyEditionArticleCount,
  WeeklyEditionAuthor,
  WeeklyEditionContent,
  WeeklyEditionEditorialCandidate,
  WeeklyEditionFactPacket,
  WeeklyEditionMatchupFact,
  WeeklyEditionSection,
  WeeklyEditionSectionKind,
  WeeklyEditionStoryAssignment,
  WeeklyEditionStorySubmission,
} from "@gshl-types";
import {
  buildWeeklyEditionArticleSlots,
  DEFAULT_WEEKLY_EDITION_ARTICLE_COUNT,
} from "./weekly-edition-articles";

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

export function choose<T>(
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

export function scoreline(matchup: WeeklyEditionMatchupFact) {
  return `${matchup.awayTeamName} ${matchup.awayScore}–${matchup.homeScore} ${matchup.homeTeamName}`;
}

function matchupStageLabel(matchup: WeeklyEditionMatchupFact) {
  return matchupStageLabelForGameType(matchup.gameType);
}

export function matchupStageLabelForGameType(gameType?: string) {
  if (gameType === "F") return "Final";
  if (gameType === "SF") return "Semifinal";
  if (gameType === "QF") return "Quarterfinal";
  return undefined;
}

export function matchupSummary(matchup: WeeklyEditionMatchupFact) {
  const stage = matchupStageLabel(matchup);
  const stagePrefix = stage ? `${stage}: ` : "";
  const categoryNote = matchup.categoryMargins.find(
    (category) => category.winnerTeamName === matchup.winnerTeamName,
  );
  const categorySentence = categoryNote
    ? ` ${categoryNote.winnerTeamName} created its widest category edge in ${categoryNote.category}, ${categoryNote.homeValue}–${categoryNote.awayValue}.`
    : "";
  if (!matchup.winnerTeamName) {
    return `${stagePrefix}${matchup.homeTeamName} and ${matchup.awayTeamName} finished level at ${matchup.homeScore}–${matchup.awayScore}.`;
  }
  return `${stagePrefix}${matchup.winnerTeamName} beat ${matchup.loserTeamName} ${Math.max(matchup.homeScore, matchup.awayScore)}–${Math.min(matchup.homeScore, matchup.awayScore)}.${categorySentence}`;
}

export function pressBoxEditorialCandidates(
  packet: WeeklyEditionFactPacket,
) {
  const loserTournamentCandidateIds = new Set(
    packet.matchups
      .filter((matchup) => matchup.gameType === "LT")
      .map((matchup) => `matchup:${matchup.matchupId}`),
  );
  return (packet.editorialCandidates ?? []).filter(
    (candidate) => !loserTournamentCandidateIds.has(candidate.id),
  );
}

export const WEEKLY_EDITION_STAFF = {
  editorInChief: {
    name: "Graham MacIntyre",
    position: "Editor-in-Chief",
    scope: "league",
  },
  headOfAnalytics: {
    name: "Evan Soderberg",
    position: "Head of Analytics",
    scope: "league",
  },
  headInsider: {
    name: "Darren Leclair",
    position: "GSHL Head Insider",
    scope: "league",
  },
  insider: {
    name: "Mike Halvorsen",
    position: "GSHL Insider",
    scope: "league",
  },
  nationalReporter: {
    name: "Scott Bannerman",
    position: "National Reporter",
    scope: "league",
  },
  analyticsReporter: {
    name: "Nate Carlson",
    position: "Analytics Reporter",
    scope: "league",
  },
} as const satisfies Record<string, WeeklyEditionAuthor>;

const ANALYTICS_SECTION_KINDS = new Set<WeeklyEditionSectionKind>([
  "three_stars",
  "power_movers",
  "season_predictions",
]);
const INSIDER_SECTION_KINDS = new Set<WeeklyEditionSectionKind>([
  "transaction_wire",
  "expiring_contracts",
  "ufa_market",
]);

export function getWeeklyEditionFallbackAuthor(
  kind: WeeklyEditionSectionKind,
): WeeklyEditionAuthor {
  if (ANALYTICS_SECTION_KINDS.has(kind)) {
    return { ...WEEKLY_EDITION_STAFF.analyticsReporter };
  }
  if (INSIDER_SECTION_KINDS.has(kind)) {
    return { ...WEEKLY_EDITION_STAFF.insider };
  }
  return { ...WEEKLY_EDITION_STAFF.nationalReporter };
}

export function referencedTeams(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
) {
  const headline = item.headline.toLowerCase();
  const body = item.body.toLowerCase();
  return packet.teams
    .map((team) => {
      const name = team.name.toLowerCase();
      const headlineIndex = headline.indexOf(name);
      const bodyIndex = body.indexOf(name);
      return {
        team,
        index:
          headlineIndex >= 0
            ? headlineIndex
            : bodyIndex >= 0
              ? headline.length + bodyIndex
              : Number.POSITIVE_INFINITY,
      };
    })
    .filter((match) => Number.isFinite(match.index))
    .sort((left, right) => left.index - right.index);
}

function teamAuthor(
  team: WeeklyEditionFactPacket["teams"][number],
): WeeklyEditionAuthor | undefined {
  if (!team.beatWriter) return undefined;
  return {
    name: team.beatWriter,
    position: `${team.name} Beat Writer`,
    scope: "team",
    teamId: team.teamId,
    teamName: team.name,
  };
}
function conferenceAuthor(
  team: WeeklyEditionFactPacket["teams"][number],
): WeeklyEditionAuthor | undefined {
  if (!team.leadReporter || !team.conferenceId || !team.conferenceName) {
    return undefined;
  }
  return {
    name: team.leadReporter,
    position: `${team.conferenceName} Lead Reporter`,
    scope: "conference",
    conferenceId: team.conferenceId,
    conferenceName: team.conferenceName,
  };
}

function weeklyEditionAuthorProfile(author: WeeklyEditionAuthor) {
  if (author.name === WEEKLY_EDITION_STAFF.editorInChief.name) {
    return {
      scoutsFor:
        "Rare league-process, governance, rule-change, championship, or major institutional stories with consequences beyond one club.",
      passesOn:
        "Routine results, ordinary roster churn, and specialist stories that belong to a beat reporter.",
      voice:
        "Decisive and economical. Establish the league-wide consequence early, explain the governing detail precisely, and avoid grandstanding.",
    };
  }
  if (author.name === WEEKLY_EDITION_STAFF.headOfAnalytics.name) {
    return {
      scoutsFor:
        "The edition's most consequential performance, record, milestone, ranking shift, or data-led investigation.",
      passesOn:
        "Small samples without a baseline, leaderboards with no change, and number dumps that do not alter the league picture.",
      voice:
        "Analytical but readable. State the finding, compare it with the right baseline, then explain the hockey consequence without pretending correlation proves motive.",
    };
  }
  if (author.name === WEEKLY_EDITION_STAFF.analyticsReporter.name) {
    return {
      scoutsFor:
        "Standout player and team performances, category results, records, milestones, power movement, and statistical trends.",
      passesOn:
        "Isolated numbers with no comparison, material roster news, and broad claims the sample cannot support.",
      voice:
        "Concrete and curious. Lead with the number that changed, supply one useful comparison, and translate the result into league terms.",
    };
  }
  if (author.name === WEEKLY_EDITION_STAFF.headInsider.name) {
    return {
      scoutsFor:
        "The edition's biggest signing, trade, contract, cap, or roster-management decision and its league-wide chain reaction.",
      passesOn:
        "Routine adds and drops, speculative motives, and any supposed negotiation detail absent from the source packet.",
      voice:
        "Direct and sourced to the ledger. Separate what happened from what it changes, and never imitate anonymous-sourcing language or invent a motive.",
    };
  }
  if (author.name === WEEKLY_EDITION_STAFF.insider.name) {
    return {
      scoutsFor:
        "Signings, trades, adds, drops, expiring contracts, cap developments, and the next roster decision created by them.",
      passesOn:
        "Transaction lists with no consequence, unsupported market rumours, and performance stories with no roster angle.",
      voice:
        "Fast and specific. Put the move, amount, status, or deadline first, then follow the roster and cap consequences one step at a time.",
    };
  }
  if (author.name === WEEKLY_EDITION_STAFF.nationalReporter.name) {
    return {
      scoutsFor:
        "League-wide results, championship and season narratives, power structure, cross-conference comparisons, draft outlooks, and preseason forecasts.",
      passesOn:
        "A local development with no wider stakes and specialist cap or analytics stories better handled by those desks.",
      voice:
        "Broad without becoming vague. Connect two or more grounded developments, keep the hierarchy clear, and finish on the next pressure point rather than a moral.",
    };
  }
  if (author.scope === "team") {
    return {
      scoutsFor: `Results, roster moves, contracts, player performances, matchup trends, and decisions specifically centered on ${author.teamName ?? "the assigned team"}.`,
      passesOn:
        "League-wide stories where the assigned team is incidental, plus claims that require another club's private perspective.",
      voice:
        "Close to the beat, not promotional. Use the team-specific detail another desk might miss, acknowledge the opposing evidence, and explain the next local consequence.",
    };
  }
  return {
    scoutsFor: `Standings pressure, matchups, trends, and roster decisions centered on ${author.conferenceName ?? "the assigned conference"}, especially stories that connect more than one team.`,
    passesOn:
      "Single-team housekeeping with no conference consequence and developments centered outside the assigned conference.",
    voice:
      "Comparative and fair. Locate the story inside the conference race, contrast the relevant teams with specific evidence, and resist homer language.",
  };
}

export function buildWeeklyEditionAuthorRoster(
  packet: WeeklyEditionFactPacket,
) {
  return uniqueAuthors([
    ...Object.values(WEEKLY_EDITION_STAFF).map((author) => ({ ...author })),
    ...packet.teams.map(conferenceAuthor),
    ...packet.teams.map(teamAuthor),
  ]).map((author) => ({ author, ...weeklyEditionAuthorProfile(author) }));
}

function weeklyEditionAuthorKey(author: WeeklyEditionAuthor) {
  return author.name.trim().toLowerCase();
}

export function sameWeeklyEditionAuthor(
  left: WeeklyEditionAuthor,
  right: WeeklyEditionAuthor,
) {
  return (
    left.name === right.name &&
    left.position === right.position &&
    left.scope === right.scope &&
    left.teamId === right.teamId &&
    left.teamName === right.teamName &&
    left.conferenceId === right.conferenceId &&
    left.conferenceName === right.conferenceName
  );
}

const ANALYTICS_CANDIDATE_KINDS = new Set<
  WeeklyEditionEditorialCandidate["kind"]
>([
  "player_performance",
  "team_performance",
  "record",
  "milestone",
  "award_race",
  "award",
  "gm_ranking",
  "performance",
  "matchup",
]);

const INSIDER_CANDIDATE_KINDS = new Set<
  WeeklyEditionEditorialCandidate["kind"]
>(["transaction", "contract", "cap", "ufa", "activity"]);

function weeklyEditionCandidateTeamIds(
  candidate: WeeklyEditionEditorialCandidate,
  packet: WeeklyEditionFactPacket,
) {
  const teamIds = new Set<string>();
  if (candidate.teamId) teamIds.add(candidate.teamId);
  if (candidate.kind === "matchup" && candidate.id.startsWith("matchup:")) {
    const matchup = packet.matchups.find(
      (row) => `matchup:${row.matchupId}` === candidate.id,
    );
    if (matchup) {
      teamIds.add(matchup.homeTeamId);
      teamIds.add(matchup.awayTeamId);
    }
  }
  return [...teamIds];
}

function writerCanLeadCandidate(
  author: WeeklyEditionAuthor,
  candidate: WeeklyEditionEditorialCandidate,
  packet: WeeklyEditionFactPacket,
) {
  const candidateTeamIds = weeklyEditionCandidateTeamIds(candidate, packet);
  if (author.scope === "team") {
    return Boolean(author.teamId && candidateTeamIds.includes(author.teamId));
  }
  if (author.scope === "conference") {
    return candidateTeamIds.some(
      (teamId) =>
        packet.teams.find((row) => row.teamId === teamId)?.conferenceId ===
        author.conferenceId,
    );
  }
  if (author.name === WEEKLY_EDITION_STAFF.editorInChief.name) {
    return candidate.importance >= 90;
  }
  if (author.name === WEEKLY_EDITION_STAFF.headOfAnalytics.name) {
    return (
      candidate.importance >= 90 &&
      ANALYTICS_CANDIDATE_KINDS.has(candidate.kind)
    );
  }
  if (author.name === WEEKLY_EDITION_STAFF.analyticsReporter.name) {
    return ANALYTICS_CANDIDATE_KINDS.has(candidate.kind);
  }
  if (author.name === WEEKLY_EDITION_STAFF.headInsider.name) {
    return (
      candidate.importance >= 80 && INSIDER_CANDIDATE_KINDS.has(candidate.kind)
    );
  }
  if (author.name === WEEKLY_EDITION_STAFF.insider.name) {
    return INSIDER_CANDIDATE_KINDS.has(candidate.kind);
  }
  return true;
}

export function buildWeeklyEditionStoryLedger(packet: WeeklyEditionFactPacket) {
  return pressBoxEditorialCandidates(packet).map((candidate) => {
    const team = packet.teams.find((row) => row.teamId === candidate.teamId);
    const relatedTeams = weeklyEditionCandidateTeamIds(candidate, packet).map(
      (teamId) => {
        const relatedTeam = packet.teams.find((row) => row.teamId === teamId);
        return {
          teamId,
          teamName: relatedTeam?.name,
          conferenceId: relatedTeam?.conferenceId,
          conferenceName: relatedTeam?.conferenceName,
        };
      },
    );
    return {
      ...candidate,
      conferenceId: team?.conferenceId,
      conferenceName: team?.conferenceName,
      relatedTeams,
    };
  });
}

function weeklyEditionPitchScore(
  candidate: WeeklyEditionEditorialCandidate,
  submission: WeeklyEditionStorySubmission["pitches"][number],
) {
  const { scores } = submission;
  return (
    candidate.importance +
    scores.consequence * 4 +
    scores.readerInterest * 3 +
    scores.evidenceStrength * 2 +
    scores.freshness
  );
}

export function selectWeeklyEditionStoryAssignments(
  packet: WeeklyEditionFactPacket,
  submissions: WeeklyEditionStorySubmission[],
  articleCount: WeeklyEditionArticleCount = DEFAULT_WEEKLY_EDITION_ARTICLE_COUNT,
): WeeklyEditionStoryAssignment[] {
  const articleSlots = buildWeeklyEditionArticleSlots(articleCount);
  const roster = buildWeeklyEditionAuthorRoster(packet).map(
    ({ author }) => author,
  );
  const rosterByKey = new Map(
    roster.map((author) => [weeklyEditionAuthorKey(author), author]),
  );
  const submittedAuthors = new Set<string>();
  for (const submission of submissions) {
    const key = weeklyEditionAuthorKey(submission.author);
    const expected = rosterByKey.get(key);
    if (!expected || !sameWeeklyEditionAuthor(expected, submission.author)) {
      throw new Error(
        `The pitch desk used an unknown author: ${submission.author.name}`,
      );
    }
    if (submittedAuthors.has(key)) {
      throw new Error(
        `The pitch desk submitted ${submission.author.name} more than once`,
      );
    }
    submittedAuthors.add(key);
  }
  const missingAuthors = roster.filter(
    (author) => !submittedAuthors.has(weeklyEditionAuthorKey(author)),
  );
  if (missingAuthors.length > 0) {
    throw new Error(
      `The pitch desk skipped: ${missingAuthors.map((author) => author.name).join(", ")}`,
    );
  }

  const candidates = pressBoxEditorialCandidates(packet);
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const seenPitchIds = new Set<string>();
  const eligible = submissions.flatMap((submission) => {
    const author = rosterByKey.get(weeklyEditionAuthorKey(submission.author))!;
    return submission.pitches.flatMap((pitch) => {
      const pitchKey = `${weeklyEditionAuthorKey(author)}:${pitch.pitchId}`;
      const lead = candidatesById.get(pitch.leadCandidateId);
      const supportIds = [...new Set(pitch.supportingCandidateIds)].filter(
        (candidateId) => candidateId !== pitch.leadCandidateId,
      );
      const support = supportIds.map((candidateId) =>
        candidatesById.get(candidateId),
      );
      if (
        seenPitchIds.has(pitchKey) ||
        !lead ||
        support.some((candidate) => !candidate) ||
        !writerCanLeadCandidate(author, lead, packet) ||
        pitch.proposedHeadline.length > 120 ||
        pitch.angle.length > 600
      ) {
        return [];
      }
      seenPitchIds.add(pitchKey);
      return [
        {
          ...pitch,
          supportingCandidateIds: supportIds,
          author,
          lead,
          editorialScore: weeklyEditionPitchScore(lead, pitch),
        },
      ];
    });
  });
  eligible.sort(
    (left, right) =>
      right.editorialScore - left.editorialScore ||
      right.lead.importance - left.lead.importance ||
      left.pitchId.localeCompare(right.pitchId),
  );

  const selected: typeof eligible = [];
  const usedAuthors = new Set<string>();
  const usedLeadCandidates = new Set<string>();
  const teamCounts = new Map<string, number>();
  const kindCounts = new Map<WeeklyEditionEditorialCandidate["kind"], number>();
  const takePitches = (enforceMix: boolean) => {
    for (const pitch of eligible) {
      if (selected.length === articleSlots.length) break;
      const authorKey = weeklyEditionAuthorKey(pitch.author);
      const teamId = pitch.lead.teamId;
      const kind = pitch.lead.kind;
      if (
        usedAuthors.has(authorKey) ||
        usedLeadCandidates.has(pitch.leadCandidateId) ||
        (enforceMix && teamId && (teamCounts.get(teamId) ?? 0) >= 2) ||
        (enforceMix && (kindCounts.get(kind) ?? 0) >= 2)
      ) {
        continue;
      }
      selected.push(pitch);
      usedAuthors.add(authorKey);
      usedLeadCandidates.add(pitch.leadCandidateId);
      if (teamId) teamCounts.set(teamId, (teamCounts.get(teamId) ?? 0) + 1);
      kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
    }
  };
  takePitches(true);
  takePitches(false);
  if (selected.length < articleSlots.length) {
    throw new Error(
      `The pitch desk found only ${selected.length} distinct, eligible stories; ${articleCount} are required`,
    );
  }

  return articleSlots.map((slot, index) => {
    const pitch = selected[index]!;
    return {
      ...slot,
      author: pitch.author,
      pitchId: pitch.pitchId,
      leadCandidateId: pitch.leadCandidateId,
      supportingCandidateIds: pitch.supportingCandidateIds,
      proposedHeadline: pitch.proposedHeadline,
      angle: pitch.angle,
      scores: pitch.scores,
      editorialScore: Math.round(pitch.editorialScore * 10) / 10,
    };
  });
}

function teamFocusForSection(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
) {
  if (item.kind === "biggest_story") {
    const leadCandidate = pressBoxEditorialCandidates(packet)[0];
    if (leadCandidate?.teamId) {
      return packet.teams.find((team) => team.teamId === leadCandidate.teamId);
    }
  }
  if (item.kind === "season_recap") {
    const leadCandidate = pressBoxEditorialCandidates(packet)[0];
    const hero = packet.matchups.find(
      (matchup) => matchup.matchupId === packet.heroMatchupId,
    );
    const teamId = leadCandidate?.teamId ?? hero?.winnerTeamId;
    if (teamId) {
      return packet.teams.find((team) => team.teamId === teamId);
    }
  }
  if (item.kind === "missed_start") {
    return referencedTeams(item, packet).find((match) =>
      item.headline.toLowerCase().includes(match.team.name.toLowerCase()),
    )?.team;
  }
  return undefined;
}

function uniqueAuthors(authors: Array<WeeklyEditionAuthor | undefined>) {
  const seen = new Set<string>();
  return authors.filter((author): author is WeeklyEditionAuthor => {
    if (!author) return false;
    const key = author.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rotateAuthors(
  authors: WeeklyEditionAuthor[],
  packet: WeeklyEditionFactPacket,
  item: WeeklyEditionSection,
  salt: string,
) {
  return [...authors].sort((left, right) => {
    const leftHash = hashWeeklyEditionSource(
      `${packet.season.id}:${packet.week.id}:${packet.issueType}:${item.id}:${salt}:${left.name}`,
    );
    const rightHash = hashWeeklyEditionSource(
      `${packet.season.id}:${packet.week.id}:${packet.issueType}:${item.id}:${salt}:${right.name}`,
    );
    return (
      leftHash.localeCompare(rightHash) || left.name.localeCompare(right.name)
    );
  });
}

function contextualAuthors(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
) {
  const matches = referencedTeams(item, packet);
  if (matches.length === 0) return [];
  const primary = matches[0]!.team;
  const focusedTeam = teamFocusForSection(item, packet);
  const teamAuthors = focusedTeam ? [teamAuthor(focusedTeam)] : [];
  const conferenceAuthors = matches.map((match) =>
    conferenceAuthor(match.team),
  );
  const authors =
    item.kind === "matchup_roundup" &&
    matches.length > 1 &&
    matches.every((match) => match.team.conferenceId === primary.conferenceId)
      ? [...conferenceAuthors, ...teamAuthors]
      : [...teamAuthors, ...conferenceAuthors];
  return rotateAuthors(
    uniqueAuthors(authors),
    packet,
    item,
    "contextual-reporters",
  );
}

function isMajorAnalyticsAssignment(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
  isPrimary: boolean,
) {
  const leadCandidate = pressBoxEditorialCandidates(packet)[0];
  return (
    (isPrimary &&
      (item.kind === "three_stars" ||
        item.kind === "power_movers" ||
        item.kind === "season_predictions")) ||
    (item.kind === "biggest_story" &&
      (leadCandidate?.kind === "player_performance" ||
        leadCandidate?.kind === "team_performance" ||
        leadCandidate?.kind === "record" ||
        leadCandidate?.kind === "milestone") &&
      (leadCandidate.importance ?? 0) >= 90)
  );
}

function isAnalyticsAssignment(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
) {
  const leadCandidate = pressBoxEditorialCandidates(packet)[0];
  return (
    ANALYTICS_SECTION_KINDS.has(item.kind) ||
    (item.kind === "biggest_story" &&
      (leadCandidate?.kind === "player_performance" ||
        leadCandidate?.kind === "team_performance" ||
        leadCandidate?.kind === "record" ||
        leadCandidate?.kind === "milestone"))
  );
}

function isMajorInsiderAssignment(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
  isPrimary: boolean,
) {
  const leadCandidate = pressBoxEditorialCandidates(packet)[0];
  return (
    (isPrimary && INSIDER_SECTION_KINDS.has(item.kind)) ||
    (item.kind === "biggest_story" &&
      leadCandidate?.kind === "transaction" &&
      (leadCandidate.importance ?? 0) >= 80)
  );
}

function isInsiderAssignment(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
) {
  const leadCandidate = pressBoxEditorialCandidates(packet)[0];
  return (
    INSIDER_SECTION_KINDS.has(item.kind) ||
    (item.kind === "biggest_story" && leadCandidate?.kind === "transaction")
  );
}

function specialistAuthors(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
  isPrimary: boolean,
) {
  if (packet.issueType === "resigning_outlook" && item.kind === "next_week") {
    return [{ ...WEEKLY_EDITION_STAFF.editorInChief }];
  }
  if (isMajorAnalyticsAssignment(item, packet, isPrimary)) {
    return [
      { ...WEEKLY_EDITION_STAFF.headOfAnalytics },
      { ...WEEKLY_EDITION_STAFF.analyticsReporter },
    ];
  }
  if (isAnalyticsAssignment(item, packet)) {
    return [{ ...WEEKLY_EDITION_STAFF.analyticsReporter }];
  }
  if (isMajorInsiderAssignment(item, packet, isPrimary)) {
    return [
      { ...WEEKLY_EDITION_STAFF.headInsider },
      { ...WEEKLY_EDITION_STAFF.insider },
    ];
  }
  if (isInsiderAssignment(item, packet)) {
    return [{ ...WEEKLY_EDITION_STAFF.insider }];
  }
  return [];
}

function allAvailableAuthors(
  packet: WeeklyEditionFactPacket,
  item: WeeklyEditionSection,
) {
  const conferenceAuthors = packet.teams.map(conferenceAuthor);
  const standardStaff = Object.values(WEEKLY_EDITION_STAFF).filter(
    (author) => author.position !== "Editor-in-Chief",
  );
  return [
    ...rotateAuthors(
      uniqueAuthors([...conferenceAuthors, ...standardStaff]),
      packet,
      item,
      "full-newsroom",
    ),
    { ...WEEKLY_EDITION_STAFF.editorInChief },
  ];
}

function authorCandidatesForSection(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
  isPrimary: boolean,
) {
  const specialists = specialistAuthors(item, packet, isPrimary);
  const contextual = contextualAuthors(item, packet);
  const general = rotateAuthors(
    uniqueAuthors([
      ...contextual,
      { ...WEEKLY_EDITION_STAFF.nationalReporter },
    ]),
    packet,
    item,
    "general-reporters",
  );
  return uniqueAuthors([
    ...specialists,
    ...general,
    ...allAvailableAuthors(packet, item),
  ]);
}

function authorForSection(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
  isPrimary: boolean,
  usedAuthorNames: Set<string>,
): WeeklyEditionAuthor {
  const author = authorCandidatesForSection(item, packet, isPrimary).find(
    (candidate) => !usedAuthorNames.has(candidate.name.trim().toLowerCase()),
  );
  if (!author) {
    throw new Error("A unique reporter could not be assigned to every article");
  }
  return author;
}

function addTeamReporterPerspective(
  item: WeeklyEditionSection,
  author: WeeklyEditionAuthor,
) {
  if (author.scope !== "team" || !author.teamName) return item.body;
  const note = ` From the ${author.teamName} side of the story, that is the detail worth circling.`;
  return item.body.length + note.length <= 1000
    ? `${item.body}${note}`
    : item.body;
}

export function normalizeWeeklyEditionArticleGrid(
  content: WeeklyEditionContent,
  packet: WeeklyEditionFactPacket,
): WeeklyEditionContent {
  const sections = content.sections.slice(0, 6);
  if (sections.length < 6) {
    const editorialCandidates = pressBoxEditorialCandidates(packet);
    const supporting = editorialCandidates
      .slice(1, 3)
      .map((candidate) => candidate.summary)
      .join(" ");
    const notebookId = sections.some((item) => item.id === "league_notebook")
      ? "league_notebook_extra"
      : "league_notebook";
    sections.push(
      section(
        "league_notebook",
        "Press Box Notebook",
        editorialCandidates[1]?.headlineHint ??
          "What else caught the Press Box eye",
        supporting ||
          "The next GSHL story is already taking shape across the standings, transaction wire and weekly performance board.",
        editorialCandidates[1]?.links ?? [],
        notebookId,
      ),
    );
  }
  return { ...content, sections };
}

function section(
  kind: WeeklyEditionSectionKind,
  eyebrow: string,
  headline: string,
  body: string,
  links: WeeklyEditionSection["links"],
  id: string = kind,
): WeeklyEditionSection {
  return { id, kind, eyebrow, headline, body, links };
}

export function assignWeeklyEditionAuthors(
  content: WeeklyEditionContent,
  packet: WeeklyEditionFactPacket,
): WeeklyEditionContent {
  const normalized = normalizeWeeklyEditionArticleGrid(content, packet);
  const usedAuthorNames = new Set<string>();
  return {
    ...normalized,
    sections: normalized.sections.map((item, index) => {
      const author = authorForSection(item, packet, index < 2, usedAuthorNames);
      usedAuthorNames.add(author.name.trim().toLowerCase());
      return {
        ...item,
        body: addTeamReporterPerspective(item, author),
        author,
      };
    }),
  };
}


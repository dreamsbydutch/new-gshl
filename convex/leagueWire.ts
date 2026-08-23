import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";

import { requireCommissioner } from "./lib/auth";
import { toUtcTimestamp, utcTimestampToDateKey } from "./lib/timestamps";
import {
  rankLeagueWirePowerMovements,
  selectLeagueWireStars,
} from "../src/lib/utils/features/league-wire";

export type LeagueWireKind = Doc<"leagueWirePosts">["kind"];
export type LeagueWireLink = Doc<"leagueWirePosts">["links"][number];
export type LeagueWireTradePackage = NonNullable<
  Doc<"leagueWirePosts">["tradePackages"]
>[number];

export interface LeagueWirePostInput {
  seasonId: Id<"seasons">;
  kind: LeagueWireKind;
  sourceKey: string;
  occurredAt: number;
  title: string;
  summary?: string;
  body?: string;
  teamIds?: Id<"teams">[];
  playerIds?: Id<"players">[];
  links: LeagueWireLink[];
  tradePackages?: LeagueWireTradePackage[];
  authorId?: Id<"authUsers">;
}

interface TeamSnapshot {
  id: Id<"teams">;
  seasonId: Id<"seasons">;
  name: string;
  abbr: string;
  logoUrl: string;
  ownerId: Id<"owners">;
}

const MAX_POSTS = 30;
const MAX_TITLE_LENGTH = 120;
const MAX_SUMMARY_LENGTH = 320;
const MAX_BODY_LENGTH = 2_000;
const MAX_ASSET_LENGTH = 120;

function cleanText(value: string, maximum: number, label: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error(`${label} is required`);
  if (normalized.length > maximum) {
    throw new Error(`${label} must be ${maximum} characters or fewer`);
  }
  return normalized;
}

function cleanOptionalText(value: string | undefined, maximum: number) {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  if (!normalized) return undefined;
  if (normalized.length > maximum) {
    throw new Error(`Text must be ${maximum} characters or fewer`);
  }
  return normalized;
}

function cleanOptionalBody(value: string | undefined) {
  const normalized = value?.trim().replace(/\r\n/g, "\n") ?? "";
  if (!normalized) return undefined;
  if (normalized.length > MAX_BODY_LENGTH) {
    throw new Error(`Text must be ${MAX_BODY_LENGTH} characters or fewer`);
  }
  return normalized;
}

function safeHref(value: string) {
  const href = value.trim();
  if (!href) throw new Error("Link destination is required");
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const parsed = new URL(href);
    if (parsed.protocol === "https:") return parsed.toString();
  } catch {
    // The shared error below is more useful than URL's implementation detail.
  }
  throw new Error("Links must use an internal path or HTTPS URL");
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateTimestamp(value: unknown, fallback = Date.now()) {
  const timestamp = toUtcTimestamp(value);
  if (timestamp !== null) return timestamp;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = Date.parse(`${value}T12:00:00.000Z`);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function previousCalendarDate(date: string) {
  const timestamp = Date.parse(`${date}T12:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp - 86_400_000).toISOString().slice(0, 10);
}

function publicTeamHref(seasonId: Id<"seasons">, ownerId: Id<"owners">) {
  return `/lockerroom?view=roster&season=${encodeURIComponent(String(seasonId))}&owner=${encodeURIComponent(String(ownerId))}`;
}

function playerHref(
  seasonId: Id<"seasons">,
  ownerId: Id<"owners">,
  playerId: Id<"players">,
) {
  return `${publicTeamHref(seasonId, ownerId)}#player-${encodeURIComponent(String(playerId))}`;
}

async function loadTeamSnapshot(
  ctx: MutationCtx,
  teamId: Id<"teams">,
): Promise<TeamSnapshot | null> {
  const team = await ctx.db.get(teamId);
  if (!team) return null;
  const franchise = await ctx.db.get(team.franchiseId);
  if (!franchise) return null;
  return {
    id: team._id,
    seasonId: team.seasonId,
    name: franchise.name,
    abbr: franchise.abbr,
    logoUrl: franchise.logoUrl ?? "",
    ownerId: franchise.ownerId,
  };
}

export async function upsertLeagueWirePost(
  ctx: MutationCtx,
  input: LeagueWirePostInput,
) {
  const sourceKey = cleanText(input.sourceKey, 180, "Source key");
  const now = Date.now();
  const values = {
    seasonId: input.seasonId,
    kind: input.kind,
    status: "published" as const,
    sourceKey,
    occurredAt: input.occurredAt,
    title: cleanText(input.title, MAX_TITLE_LENGTH, "Title"),
    summary: cleanOptionalText(input.summary, MAX_SUMMARY_LENGTH),
    body: cleanOptionalBody(input.body),
    teamIds: [...new Set(input.teamIds ?? [])],
    playerIds: [...new Set(input.playerIds ?? [])],
    links: input.links.map((link) => ({
      label: cleanText(link.label, 40, "Link label"),
      href: safeHref(link.href),
    })),
    tradePackages: input.tradePackages,
    authorId: input.authorId,
    updatedAt: now,
  };
  const existing = await ctx.db
    .query("leagueWirePosts")
    .withIndex("by_sourceKey", (range) => range.eq("sourceKey", sourceKey))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, values);
    return existing._id;
  }
  return ctx.db.insert("leagueWirePosts", { ...values, createdAt: now });
}

export async function withdrawLeagueWirePost(
  ctx: MutationCtx,
  sourceKey: string,
) {
  const existing = await ctx.db
    .query("leagueWirePosts")
    .withIndex("by_sourceKey", (range) => range.eq("sourceKey", sourceKey))
    .unique();
  if (!existing || existing.status === "withdrawn") return;
  await ctx.db.patch(existing._id, {
    status: "withdrawn",
    updatedAt: Date.now(),
  });
}

export const list = query({
  args: {
    seasonId: v.id("seasons"),
    take: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const take = Math.min(MAX_POSTS, Math.max(1, Math.floor(args.take ?? 12)));
    const posts = await ctx.db
      .query("leagueWirePosts")
      .withIndex("by_seasonId_status_occurredAt", (range) =>
        range.eq("seasonId", args.seasonId).eq("status", "published"),
      )
      .order("desc")
      .take(take);
    const teamIds = [
      ...new Set(posts.flatMap((post) => post.teamIds.map(String))),
    ] as Array<Id<"teams">>;
    const teams = await Promise.all(
      teamIds.map(async (teamId) => {
        const team = await ctx.db.get(teamId);
        if (!team) return null;
        const franchise = await ctx.db.get(team.franchiseId);
        if (!franchise) return null;
        return {
          id: String(team._id),
          name: franchise.name,
          abbr: franchise.abbr,
          logoUrl: franchise.logoUrl,
        };
      }),
    );
    const teamById = new Map(
      teams
        .filter((team) => team !== null)
        .map((team) => [team.id, team] as const),
    );
    return posts.map((post) => ({
      id: String(post._id),
      kind: post.kind,
      occurredAt: new Date(post.occurredAt).toISOString(),
      title: post.title,
      summary: post.summary ?? null,
      body: post.body ?? null,
      links: post.links,
      teams: post.teamIds.flatMap((teamId) => {
        const team = teamById.get(String(teamId));
        return team ? [team] : [];
      }),
      tradePackages:
        post.tradePackages?.map((tradePackage) => ({
          teamId: String(tradePackage.teamId),
          teamName: tradePackage.teamName,
          assets: tradePackage.assets.map((asset) => ({
            label: asset.label,
            playerId: asset.playerId ? String(asset.playerId) : null,
            draftPickId: asset.draftPickId ? String(asset.draftPickId) : null,
          })),
        })) ?? null,
    }));
  },
});

export const publishAnnouncement = mutation({
  args: {
    seasonId: v.id("seasons"),
    title: v.string(),
    body: v.string(),
    linkLabel: v.string(),
    linkHref: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireCommissioner(ctx);
    if (!(await ctx.db.get(args.seasonId))) {
      throw new Error("League Wire season not found");
    }
    const body = cleanOptionalBody(args.body);
    if (!body) throw new Error("Announcement is required");
    const now = Date.now();
    const id = await upsertLeagueWirePost(ctx, {
      seasonId: args.seasonId,
      kind: "announcement",
      sourceKey: `announcement:${String(user._id)}:${now}`,
      occurredAt: now,
      title: args.title,
      body,
      links: [{ label: args.linkLabel, href: args.linkHref }],
      authorId: user._id,
    });
    return { postId: String(id) };
  },
});

export const publishTrade = mutation({
  args: {
    seasonId: v.id("seasons"),
    firstTeamId: v.id("teams"),
    firstAssets: v.array(v.string()),
    secondTeamId: v.id("teams"),
    secondAssets: v.array(v.string()),
    summary: v.optional(v.string()),
    proposalHref: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCommissioner(ctx);
    if (args.firstTeamId === args.secondTeamId) {
      throw new Error("A trade needs two different teams");
    }
    if (!args.firstAssets.length || !args.secondAssets.length) {
      throw new Error("List the assets received by both teams");
    }
    if (args.firstAssets.length > 20 || args.secondAssets.length > 20) {
      throw new Error("A trade package can contain at most 20 assets");
    }
    const [firstTeam, secondTeam] = await Promise.all([
      loadTeamSnapshot(ctx, args.firstTeamId),
      loadTeamSnapshot(ctx, args.secondTeamId),
    ]);
    if (!firstTeam || !secondTeam) throw new Error("Trade team not found");
    if (
      firstTeam.seasonId !== args.seasonId ||
      secondTeam.seasonId !== args.seasonId
    ) {
      throw new Error("Trade teams must belong to the selected season");
    }
    const cleanAssets = (assets: string[]) =>
      assets.map((asset) => ({
        label: cleanText(asset, MAX_ASSET_LENGTH, "Trade asset"),
      }));
    const now = Date.now();
    const links: LeagueWireLink[] = [
      {
        label: firstTeam.name,
        href: publicTeamHref(args.seasonId, firstTeam.ownerId),
      },
      {
        label: secondTeam.name,
        href: publicTeamHref(args.seasonId, secondTeam.ownerId),
      },
    ];
    if (args.proposalHref?.trim()) {
      links.unshift({ label: "View proposal", href: args.proposalHref });
    }
    const id = await upsertLeagueWirePost(ctx, {
      seasonId: args.seasonId,
      kind: "trade",
      sourceKey: `trade:${String(user._id)}:${now}`,
      occurredAt: now,
      title: `${firstTeam.name} and ${secondTeam.name} complete a trade`,
      summary: args.summary,
      teamIds: [firstTeam.id, secondTeam.id],
      links,
      tradePackages: [
        {
          teamId: firstTeam.id,
          teamName: firstTeam.name,
          assets: cleanAssets(args.firstAssets),
        },
        {
          teamId: secondTeam.id,
          teamName: secondTeam.name,
          assets: cleanAssets(args.secondAssets),
        },
      ],
      authorId: user._id,
    });
    return { postId: String(id) };
  },
});

export const withdraw = mutation({
  args: { postId: v.id("leagueWirePosts") },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("League Wire post not found");
    await ctx.db.patch(post._id, {
      status: "withdrawn",
      updatedAt: Date.now(),
    });
    return { postId: String(post._id) };
  },
});

async function materializeRosterPosts(
  ctx: MutationCtx,
  seasonId: Id<"seasons">,
  playerDays: Doc<"playerDayStatLines">[],
) {
  const playerIds = [
    ...new Set(playerDays.map((row) => String(row.playerId))),
  ] as Array<Id<"players">>;
  const teamIds = [
    ...new Set(playerDays.map((row) => String(row.gshlTeamId))),
  ] as Array<Id<"teams">>;
  const [players, teams] = await Promise.all([
    Promise.all(playerIds.map((playerId) => ctx.db.get(playerId))),
    Promise.all(teamIds.map((teamId) => loadTeamSnapshot(ctx, teamId))),
  ]);
  const playerById = new Map(
    players
      .filter((player) => player !== null)
      .map((player) => [String(player._id), player] as const),
  );
  const teamById = new Map(
    teams
      .filter((team) => team !== null)
      .map((team) => [String(team.id), team] as const),
  );

  for (const row of playerDays) {
    const date = utcTimestampToDateKey(row.date);
    const player = playerById.get(String(row.playerId));
    const team = teamById.get(String(row.gshlTeamId));
    if (!date || !player || !team) continue;
    const base = {
      seasonId,
      occurredAt: dateTimestamp(date),
      teamIds: [team.id],
      playerIds: [player._id],
      links: [
        {
          label: "View player",
          href: playerHref(seasonId, team.ownerId, player._id),
        },
        {
          label: "View team",
          href: publicTeamHref(seasonId, team.ownerId),
        },
      ],
    } satisfies Omit<LeagueWirePostInput, "kind" | "sourceKey" | "title">;
    if ((asNumber(row.ADD) ?? 0) > 0) {
      await upsertLeagueWirePost(ctx, {
        ...base,
        kind: "add",
        sourceKey: `player-day:add:${String(row._id)}`,
        title: `${team.name} adds ${player.fullName}`,
      });
    } else {
      await withdrawLeagueWirePost(ctx, `player-day:add:${String(row._id)}`);
    }
    if ((asNumber(row.MS) ?? 0) > 0) {
      await upsertLeagueWirePost(ctx, {
        ...base,
        kind: "missed_start",
        sourceKey: `player-day:missed-start:${String(row._id)}`,
        title: `${player.fullName} records a missed start`,
        summary: team.name,
      });
    } else {
      await withdrawLeagueWirePost(
        ctx,
        `player-day:missed-start:${String(row._id)}`,
      );
    }
  }

  const dates = [
    ...new Set(playerDays.map((row) => utcTimestampToDateKey(row.date))),
  ].filter((date): date is string => Boolean(date));
  const rowsByDate = new Map<string, Doc<"playerDayStatLines">[]>();
  for (const row of playerDays) {
    const date = utcTimestampToDateKey(row.date);
    if (!date) continue;
    rowsByDate.set(date, [...(rowsByDate.get(date) ?? []), row]);
  }
  for (const date of dates) {
    const previousDate = previousCalendarDate(date);
    if (!previousDate || rowsByDate.has(previousDate)) continue;
    const previousRows = await ctx.db
      .query("playerDayStatLines")
      .withIndex("by_seasonId_date", (range) =>
        range.eq("seasonId", seasonId).eq("date", previousDate),
      )
      .collect();
    if (previousRows.length) rowsByDate.set(previousDate, previousRows);
  }

  const rosterMap = (rows: Doc<"playerDayStatLines">[]) => {
    const map = new Map<string, Set<string>>();
    for (const row of rows) {
      const roster = map.get(String(row.gshlTeamId)) ?? new Set<string>();
      roster.add(String(row.playerId));
      map.set(String(row.gshlTeamId), roster);
    }
    return map;
  };
  for (const date of dates) {
    const today = rowsByDate.get(date);
    const yesterday = rowsByDate.get(previousCalendarDate(date));
    if (!today?.length || !yesterday?.length) continue;
    const todayRosters = rosterMap(today);
    const yesterdayRosters = rosterMap(yesterday);
    for (const [teamId, previousRoster] of yesterdayRosters) {
      const currentRoster = todayRosters.get(teamId);
      if (!currentRoster) continue;
      const team = teamById.get(teamId);
      if (!team) continue;
      for (const playerId of previousRoster) {
        const sourceKey = `player-day:drop:${date}:${teamId}:${playerId}`;
        if (currentRoster.has(playerId)) {
          await withdrawLeagueWirePost(ctx, sourceKey);
          continue;
        }
        const player =
          playerById.get(playerId) ??
          (await ctx.db.get(playerId as Id<"players">));
        if (!player) continue;
        await upsertLeagueWirePost(ctx, {
          seasonId,
          kind: "drop",
          sourceKey,
          occurredAt: dateTimestamp(date),
          title: `${team.name} drops ${player.fullName}`,
          teamIds: [team.id],
          playerIds: [player._id],
          links: [
            {
              label: "View team",
              href: publicTeamHref(seasonId, team.ownerId),
            },
          ],
        });
      }
    }
  }
}

async function materializeMatchupPosts(
  ctx: MutationCtx,
  seasonId: Id<"seasons">,
  week: Doc<"weeks">,
  matchups: Doc<"matchups">[],
  playerWeeks: Doc<"playerWeekStatLines">[],
) {
  for (const matchup of matchups) {
    const sourceKey = `matchup-final:${String(matchup._id)}`;
    if (matchup.isComplete !== true) {
      await withdrawLeagueWirePost(ctx, sourceKey);
      continue;
    }
    const [homeTeam, awayTeam] = await Promise.all([
      loadTeamSnapshot(ctx, matchup.homeTeamId),
      loadTeamSnapshot(ctx, matchup.awayTeamId),
    ]);
    if (!homeTeam || !awayTeam) continue;
    const eligibleRows = playerWeeks
      .filter(
        (row) =>
          row.gshlTeamId === matchup.homeTeamId ||
          row.gshlTeamId === matchup.awayTeamId,
      )
      .filter((row) =>
        [row.GP, row.G, row.A, row.W, row.SV].some(
          (value) => (asNumber(value) ?? 0) > 0,
        ),
      );
    const rowByPlayerId = new Map(
      eligibleRows.map((row) => [String(row.playerId), row] as const),
    );
    const selectedStarRows = selectLeagueWireStars(
      eligibleRows.map((row) => ({
        playerId: String(row.playerId),
        teamId: String(row.gshlTeamId),
        rating: asNumber(row.Rating) ?? 0,
        points: asNumber(row.P) ?? 0,
        wins: asNumber(row.W) ?? 0,
        saves: asNumber(row.SV) ?? 0,
      })),
    ).flatMap((candidate) => {
      const row = rowByPlayerId.get(candidate.playerId);
      return row ? [row] : [];
    });
    const starPlayers = await Promise.all(
      selectedStarRows.map((row) => ctx.db.get(row.playerId)),
    );
    const stars = starPlayers.filter((player) => player !== null);
    const starSideByPlayerId = new Map(
      selectedStarRows.map(
        (row) =>
          [
            String(row.playerId),
            row.gshlTeamId === matchup.homeTeamId ? "home" : "away",
          ] as const,
      ),
    );
    const homeScore = asNumber(matchup.homeScore) ?? 0;
    const awayScore = asNumber(matchup.awayScore) ?? 0;
    const outcome =
      homeScore === awayScore
        ? `${homeTeam.name} and ${awayTeam.name} finish tied`
        : homeScore > awayScore
          ? `${homeTeam.name} defeats ${awayTeam.name}`
          : `${awayTeam.name} defeats ${homeTeam.name}`;
    const summaryParts = [
      `${awayTeam.abbr} ${awayScore} - ${homeScore} ${homeTeam.abbr}`,
    ];
    if (stars.length) {
      summaryParts.push(
        `Three stars: ${stars.map((player, index) => `${index + 1}. ${player.fullName}`).join("; ")}`,
      );
    }
    await upsertLeagueWirePost(ctx, {
      seasonId,
      kind: "matchup_final",
      sourceKey,
      occurredAt: dateTimestamp(week.endDate, dateTimestamp(matchup.updatedAt)),
      title: `${outcome}, ${awayScore}-${homeScore}`,
      summary: summaryParts.join(". "),
      teamIds: [homeTeam.id, awayTeam.id],
      playerIds: stars.map((player) => player._id),
      links: [
        {
          label: "View matchup",
          href: `/matchup/${encodeURIComponent(String(matchup._id))}?from=headlines&season=${encodeURIComponent(String(seasonId))}`,
        },
        ...stars.map((player) => ({
          label: player.fullName,
          href: `/matchup/${encodeURIComponent(String(matchup._id))}?from=headlines&season=${encodeURIComponent(String(seasonId))}&side=${starSideByPlayerId.get(String(player._id)) ?? "away"}#player-${encodeURIComponent(String(player._id))}`,
        })),
      ],
    });
  }
}

async function materializePowerPost(
  ctx: MutationCtx,
  seasonId: Id<"seasons">,
  week: Doc<"weeks">,
  rows: Doc<"teamWeekStatLines">[],
) {
  const weeks = await ctx.db
    .query("weeks")
    .withIndex("by_seasonId", (range) => range.eq("seasonId", seasonId))
    .collect();
  const orderedWeeks = [...weeks].sort(
    (left, right) =>
      (asNumber(left.weekNum) ?? 0) - (asNumber(right.weekNum) ?? 0),
  );
  const currentIndex = orderedWeeks.findIndex(
    (candidate) => candidate._id === week._id,
  );
  const previousWeek = currentIndex > 0 ? orderedWeeks[currentIndex - 1] : null;
  if (!previousWeek) return;
  const previousRows = await ctx.db
    .query("teamWeekStatLines")
    .withIndex("by_weekId", (range) => range.eq("weekId", previousWeek._id))
    .collect();
  const previousByTeam = new Map(
    previousRows.map((row) => [String(row.gshlTeamId), row] as const),
  );
  const movementRowByTeamId = new Map(
    rows.map((row) => [String(row.gshlTeamId), row] as const),
  );
  const movements = rankLeagueWirePowerMovements(
    rows.flatMap((row) => {
      const currentRank = asNumber(row.powerRk);
      const previousRank = asNumber(
        previousByTeam.get(String(row.gshlTeamId))?.powerRk,
      );
      if (
        currentRank === null ||
        previousRank === null ||
        currentRank === previousRank
      )
        return [];
      return [
        {
          teamId: String(row.gshlTeamId),
          currentRank,
          previousRank,
        },
      ];
    }),
  );
  if (!movements.length) {
    await withdrawLeagueWirePost(ctx, `power-ranking:${String(week._id)}`);
    return;
  }
  const featured = movements.slice(0, 3).flatMap((movement) => {
    const row = movementRowByTeamId.get(movement.teamId);
    return row ? [{ ...movement, row }] : [];
  });
  const snapshots = await Promise.all(
    featured.map((movement) => loadTeamSnapshot(ctx, movement.row.gshlTeamId)),
  );
  const details = featured.flatMap((movement, index) => {
    const team = snapshots[index];
    if (!team) return [];
    return [
      {
        team,
        text: `${team.name} ${movement.movement > 0 ? "rises" : "falls"} ${Math.abs(movement.movement)} ${Math.abs(movement.movement) === 1 ? "spot" : "spots"} to No. ${movement.currentRank}`,
      },
    ];
  });
  if (!details.length) return;
  await upsertLeagueWirePost(ctx, {
    seasonId,
    kind: "power_ranking",
    sourceKey: `power-ranking:${String(week._id)}`,
    occurredAt: dateTimestamp(week.startDate),
    title: details[0]?.text ?? "Power rankings updated",
    summary:
      details
        .slice(1)
        .map((detail) => detail.text)
        .join(". ") || undefined,
    teamIds: details.map((detail) => detail.team.id),
    links: [
      {
        label: "View power rankings",
        href: `/standings?view=power&season=${encodeURIComponent(String(seasonId))}`,
      },
      ...details.map((detail) => ({
        label: detail.team.name,
        href: publicTeamHref(seasonId, detail.team.ownerId),
      })),
    ],
  });
}

export const materializeSeasonRecords = internalMutation({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    const [draftPicks, ufaGroups, editions, archive, listings] =
      await Promise.all([
        ctx.db
          .query("draftPicks")
          .withIndex("by_seasonId", (range) =>
            range.eq("seasonId", args.seasonId),
          )
          .collect(),
        ctx.db
          .query("ufaOfferGroups")
          .withIndex("by_seasonId", (range) =>
            range.eq("seasonId", args.seasonId),
          )
          .collect(),
        ctx.db
          .query("weeklyEditions")
          .withIndex("by_seasonId_status_publishedAt", (range) =>
            range.eq("seasonId", args.seasonId).eq("status", "published"),
          )
          .collect(),
        ctx.db
          .query("seasonDataArchives")
          .withIndex("by_seasonId", (range) =>
            range.eq("seasonId", args.seasonId),
          )
          .first(),
        ctx.db.query("tradeBlockEntries").collect(),
      ]);

    for (const pick of draftPicks) {
      if (!pick.playerId || !pick.gshlTeamId) continue;
      const [player, team] = await Promise.all([
        ctx.db.get(pick.playerId),
        loadTeamSnapshot(ctx, pick.gshlTeamId),
      ]);
      if (!player || !team) continue;
      const teamHref = publicTeamHref(args.seasonId, team.ownerId);
      await upsertLeagueWirePost(ctx, {
        seasonId: args.seasonId,
        kind: "draft_pick",
        sourceKey: `draft-pick:${String(pick._id)}`,
        occurredAt: dateTimestamp(pick.onClockEndedAt ?? pick.updatedAt),
        title: `${team.name} drafts ${player.fullName}`,
        summary: `Round ${String(pick.round)}, pick ${String(pick.pick ?? "-")}`,
        teamIds: [team.id],
        playerIds: [player._id],
        links: [
          {
            label: "View draft",
            href: `/draft?season=${encodeURIComponent(String(args.seasonId))}#draft-pick-${encodeURIComponent(String(pick._id))}`,
          },
          {
            label: "View player",
            href: `${teamHref}#player-${encodeURIComponent(String(player._id))}`,
          },
        ],
      });
    }

    for (const group of ufaGroups) {
      const [player, offers] = await Promise.all([
        ctx.db.get(group.playerId),
        ctx.db
          .query("ufaOffers")
          .withIndex("by_group", (range) => range.eq("groupId", group._id))
          .collect(),
      ]);
      if (!player || !offers.length) continue;
      const latestOfferAt = Math.max(
        ...offers.map((offer) => offer.submittedAt),
        group.createdAt,
      );
      await upsertLeagueWirePost(ctx, {
        seasonId: args.seasonId,
        kind: "ufa_offer",
        sourceKey: `ufa-offer:${String(group._id)}`,
        occurredAt: latestOfferAt,
        title: `${player.fullName} receives ${offers.length === 1 ? "an offer" : `${offers.length} offers`}`,
        summary: `Bidding closes ${new Date(group.deadlineAt).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`,
        playerIds: [player._id],
        links: [
          {
            label: "View UFA market",
            href: `/leagueoffice?view=freeAgents&season=${encodeURIComponent(String(args.seasonId))}#ufa-player-${encodeURIComponent(String(player._id))}`,
          },
        ],
      });
      const winner = group.winningOfferId
        ? offers.find((offer) => offer._id === group.winningOfferId)
        : undefined;
      if (group.status !== "resolved" || !winner) continue;
      const team = await loadTeamSnapshot(ctx, winner.teamId);
      if (!team) continue;
      const salary = new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
        maximumFractionDigits: 0,
      }).format(winner.salary);
      const teamHref = publicTeamHref(args.seasonId, team.ownerId);
      await upsertLeagueWirePost(ctx, {
        seasonId: args.seasonId,
        kind: "ufa_result",
        sourceKey: `ufa-result:${String(group._id)}`,
        occurredAt: group.resolvedAt ?? group.updatedAt,
        title: `${team.name} signs ${player.fullName}`,
        summary: `${winner.contractLength}-year contract at ${salary}.`,
        teamIds: [team.id],
        playerIds: [player._id],
        links: [
          {
            label: "View UFA result",
            href: `/leagueoffice?view=freeAgents&season=${encodeURIComponent(String(args.seasonId))}#ufa-player-${encodeURIComponent(String(player._id))}`,
          },
          {
            label: "View player",
            href: `${teamHref}#player-${encodeURIComponent(String(player._id))}`,
          },
        ],
      });
    }

    for (const edition of editions) {
      await upsertLeagueWirePost(ctx, {
        seasonId: args.seasonId,
        kind: "press_box",
        sourceKey: `press-box:${String(edition._id)}`,
        occurredAt: dateTimestamp(edition.publishedAt),
        title: `Press Box: ${edition.issueLabel}`,
        summary: edition.seasonName,
        links: [
          {
            label: "Read edition",
            href: `/headlines/${encodeURIComponent(String(edition._id))}`,
          },
        ],
      });
    }

    for (const listing of listings) {
      const player = await ctx.db.get(listing.playerId);
      if (!player?.gshlTeamId) continue;
      const team = await loadTeamSnapshot(ctx, player.gshlTeamId);
      if (!team) continue;
      if (team.seasonId !== args.seasonId) continue;
      const teamHref = publicTeamHref(args.seasonId, team.ownerId);
      await upsertLeagueWirePost(ctx, {
        seasonId: args.seasonId,
        kind: "trade_block",
        sourceKey: `trade-block:${String(listing._id)}`,
        occurredAt: listing.updatedAt,
        title: `${player.fullName} is on the trade block`,
        summary: listing.note ?? `${team.name} is open to offers.`,
        teamIds: [team.id],
        playerIds: [player._id],
        links: [
          {
            label: "View listing",
            href: `/leagueoffice?view=tradeBlock&season=${encodeURIComponent(String(args.seasonId))}#trade-block-${encodeURIComponent(String(listing._id))}`,
          },
          {
            label: "View player",
            href: `${teamHref}#player-${encodeURIComponent(String(player._id))}`,
          },
        ],
      });
    }

    const legacyActivity = Array.isArray(archive?.activitySnapshot)
      ? archive.activitySnapshot
      : [];
    for (const raw of legacyActivity) {
      if (!raw || typeof raw !== "object") continue;
      const event = raw as Record<string, unknown>;
      const type = typeof event.type === "string" ? event.type : "";
      if (type !== "add" && type !== "drop" && type !== "missed_start") {
        continue;
      }
      const playerId =
        typeof event.playerId === "string"
          ? (event.playerId as Id<"players">)
          : null;
      const teamId =
        typeof event.teamId === "string" ? (event.teamId as Id<"teams">) : null;
      const [player, team] = await Promise.all([
        playerId ? ctx.db.get(playerId) : null,
        teamId ? loadTeamSnapshot(ctx, teamId) : null,
      ]);
      if (!player || !team) continue;
      const title =
        type === "add"
          ? `${team.name} adds ${player.fullName}`
          : type === "drop"
            ? `${team.name} drops ${player.fullName}`
            : `${player.fullName} records a missed start`;
      await upsertLeagueWirePost(ctx, {
        seasonId: args.seasonId,
        kind: type,
        sourceKey: `archive-activity:${
          typeof event.id === "string" || typeof event.id === "number"
            ? String(event.id)
            : `${type}:${typeof event.date === "string" ? event.date : "unknown"}:${String(playerId)}`
        }`,
        occurredAt: dateTimestamp(event.date),
        title,
        summary: type === "missed_start" ? team.name : undefined,
        teamIds: [team.id],
        playerIds: [player._id],
        links: [
          {
            label: "View team",
            href: publicTeamHref(args.seasonId, team.ownerId),
          },
        ],
      });
    }
  },
});

export const materializeWeek = internalMutation({
  args: {
    seasonId: v.id("seasons"),
    weekId: v.id("weeks"),
  },
  handler: async (ctx, args) => {
    const week = await ctx.db.get(args.weekId);
    if (week?.seasonId !== args.seasonId) return;
    const [playerDays, playerWeeks, teamWeeks, matchups] = await Promise.all([
      ctx.db
        .query("playerDayStatLines")
        .withIndex("by_weekId", (range) => range.eq("weekId", args.weekId))
        .collect(),
      ctx.db
        .query("playerWeekStatLines")
        .withIndex("by_weekId", (range) => range.eq("weekId", args.weekId))
        .collect(),
      ctx.db
        .query("teamWeekStatLines")
        .withIndex("by_weekId", (range) => range.eq("weekId", args.weekId))
        .collect(),
      ctx.db
        .query("matchups")
        .withIndex("by_weekId", (range) => range.eq("weekId", args.weekId))
        .collect(),
    ]);
    await materializeRosterPosts(ctx, args.seasonId, playerDays);
    await materializeMatchupPosts(
      ctx,
      args.seasonId,
      week,
      matchups,
      playerWeeks,
    );
    await materializePowerPost(ctx, args.seasonId, week, teamWeeks);
  },
});

export async function scheduleLeagueWireMaterialization(
  ctx: MutationCtx,
  table: string,
  rows: Array<Record<string, unknown>>,
) {
  if (
    table !== "playerDayStatLines" &&
    table !== "playerWeekStatLines" &&
    table !== "teamWeekStatLines" &&
    table !== "matchups"
  ) {
    return;
  }
  const scopes = new Map<
    string,
    { seasonId: Id<"seasons">; weekId: Id<"weeks"> }
  >();
  for (const row of rows) {
    if (!row.seasonId || !row.weekId) continue;
    const scope = {
      seasonId: row.seasonId as Id<"seasons">,
      weekId: row.weekId as Id<"weeks">,
    };
    scopes.set(`${String(scope.seasonId)}:${String(scope.weekId)}`, scope);
  }
  for (const scope of scopes.values()) {
    await ctx.scheduler.runAfter(0, internal.leagueWire.materializeWeek, scope);
  }
}

export const backfillSeason = mutation({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    const weeks = await ctx.db
      .query("weeks")
      .withIndex("by_seasonId", (range) => range.eq("seasonId", args.seasonId))
      .collect();
    for (const week of weeks) {
      await ctx.scheduler.runAfter(0, internal.leagueWire.materializeWeek, {
        seasonId: args.seasonId,
        weekId: week._id,
      });
    }
    await ctx.scheduler.runAfter(
      0,
      internal.leagueWire.materializeSeasonRecords,
      { seasonId: args.seasonId },
    );
    return { scheduledWeeks: weeks.length, scheduledSeasonRecords: true };
  },
});

import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { finishJob } from "./lib/jobLifecycle";
import {
  normalizeTimestampFields,
  toUtcTimestamp,
  utcTimestampToDateKey,
} from "./lib/timestamps";
import { writeNhlContracts } from "./nhlContracts";
import {
  reconcilePlayerDirectory,
  sourcePatch,
  type DirectoryPlayer,
} from "../scripts/src/domains/maintenance/player-directory";
import {
  puckPediaContractCandidates,
  reconcileNhlContracts,
} from "../scripts/src/domains/maintenance/nhl-contracts";
import {
  candidatesFromPuckPedia,
  seasonLabel,
} from "../scripts/src/domains/maintenance/nhl-salaries";

type Source = {
  seasonStartYear: number;
  seasonToken: string;
  players: DirectoryPlayer[];
};
type Snapshot = { capturedAt: number; sources: Source[] };
type Counts = {
  processed: number;
  updated: number;
  inserted: number;
  contractsInserted: number;
  contractsUpdated: number;
  seasonsInserted: number;
  skipped: number;
};
const emptyCounts = (): Counts => ({
  processed: 0,
  updated: 0,
  inserted: 0,
  contractsInserted: 0,
  contractsUpdated: 0,
  seasonsInserted: 0,
  skipped: 0,
});

async function candidates(ctx: MutationCtx, source: DirectoryPlayer) {
  const byId = await ctx.db
    .query("players")
    .withIndex("by_nhlApiId", (q) => q.eq("nhlApiId", source.nhlApiId))
    .take(3);
  if (byId.length) return byId;
  const byName = await ctx.db
    .query("players")
    .withIndex("by_fullName", (q) => q.eq("fullName", source.fullName))
    .take(10);
  const birthday = toUtcTimestamp(source.birthDate);
  if (birthday === null) return byName;
  const byBirth = await ctx.db
    .query("players")
    .withIndex("by_birthday", (q) => q.eq("birthday", birthday))
    .take(100);
  const legacyBirth = await ctx.db
    .query("players")
    .withIndex("by_birthday", (q) => q.eq("birthday", source.birthDate))
    .take(100);
  return [
    ...new Map(
      [...byName, ...byBirth, ...legacyBirth].map((p) => [p._id, p]),
    ).values(),
  ];
}

export const initialize = internalMutation({
  args: { runId: v.id("jobRuns"), storageId: v.id("_storage") },
  handler: async (ctx, { runId, storageId }) => {
    const run = await ctx.db.get(runId);
    if (
      run?.jobName !== "puckpedia-player-bio-sync" ||
      run.status !== "running"
    )
      return false;
    if (run.result !== storageId)
      await ctx.db.patch(runId, {
        result: storageId,
        cursor: "0",
        progress: emptyCounts(),
      });
    return true;
  },
});

export const batch = internalMutation({
  args: {
    runId: v.id("jobRuns"),
    offset: v.number(),
    rows: v.array(v.any()),
    capturedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run?.status === "cancelling")
      await finishJob(ctx, { runId: args.runId, status: "cancelled" });
    if (
      run?.jobName !== "puckpedia-player-bio-sync" ||
      run.status !== "running"
    )
      return false;
    if (Number(run.cursor) > args.offset) return true;
    if (Number(run.cursor) !== args.offset || args.rows.length > 20)
      throw new Error("Invalid PuckPedia batch cursor");
    const progress = { ...emptyCounts(), ...(run.progress as Counts) };
    for (const item of args.rows as Array<{
      player: DirectoryPlayer;
      year: number;
      token: string;
      current: boolean;
      firstPlayer?: boolean;
      firstContract?: boolean;
    }>) {
      progress.processed++;
      const source = item.player;
      const existing = await candidates(ctx, source);
      const plan = reconcilePlayerDirectory(
        existing.map((p) => ({
          ...p,
          id: p._id,
          birthday: utcTimestampToDateKey(p.birthday),
        })),
        [source],
        { currentDate: new Date(args.capturedAt), deactivateMissing: false },
      );
      const matchedId = [...plan.matchedPlayerIds][0];
      let player = existing.find((p) => p._id === matchedId);
      const conflictingBirthday =
        player?.birthday &&
        source.birthDate &&
        utcTimestampToDateKey(player.birthday) !== source.birthDate;
      if (
        plan.issues.length ||
        conflictingBirthday ||
        (!player &&
          existing.some(
            (p) =>
              p.nhlApiId === source.nhlApiId || p.fullName === source.fullName,
          ))
      ) {
        progress.skipped++;
        await ctx.db.insert("jobEvents", {
          runId: run._id,
          level: "warning",
          message: `${source.fullName}: ambiguous or conflicting player identity; skipped`,
          createdAt: Date.now(),
        });
        continue;
      }
      const patch = normalizeTimestampFields(
        "players",
        sourcePatch(source, new Date(args.capturedAt)),
      ) as Partial<Doc<"players">>;
      // PuckPedia provides a primary position, not GSHL multi-position eligibility.
      if (player?.nhlPos?.length) delete patch.nhlPos;
      if (!item.current)
        for (const key of Object.keys(patch))
          if (
            key.startsWith("nhl") &&
            key !== "nhlApiId" &&
            key !== "nhlPos" &&
            key !== "nhlTeam"
          )
            delete patch[key as keyof typeof patch];
      if (player && item.current) {
        const changed = Object.entries(patch).some(
          ([key, value]) =>
            JSON.stringify(player?.[key as keyof typeof player]) !==
            JSON.stringify(value),
        );
        if (changed) {
          if (run.apply)
            await ctx.db.patch(player._id, { ...patch, updatedAt: Date.now() });
          progress.updated++;
        }
        // Contract matching must see the identity just refreshed above, also
        // during a dry run where the proposed profile has not been persisted.
        player = { ...player, ...patch };
      } else if (!player) {
        if (run.apply || item.firstPlayer !== false) progress.inserted++;
        if (run.apply) {
          const id = await ctx.db.insert("players", {
            ...patch,
            firstName: source.firstName,
            lastName: source.lastName,
            fullName: source.fullName,
            posGroup: source.posGroup,
            nhlApiId: source.nhlApiId,
            isActive: true,
            isSignable: false,
            isResignable: "DRAFT",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          player = (await ctx.db.get(id))!;
        }
      }
      const audit = puckPediaContractCandidates(
        [source],
        item.year,
        item.token,
      );
      if (audit.warnings.length) {
        progress.skipped++;
        await ctx.db.insert("jobEvents", {
          runId: run._id,
          level: "warning",
          message: audit.warnings.join("; "),
          createdAt: Date.now(),
        });
      }
      if (player && audit.rows.length) {
        const observations = reconcileNhlContracts(audit.rows, [
          {
            ...player,
            id: player._id,
            // The guarded directory match above has already resolved this
            // identity, including profiles missing their NHL ID or birthday.
            nhlApiId: source.nhlApiId,
            birthday: source.birthDate || player.birthday,
          },
        ]).rows;
        if (!observations.length) {
          progress.skipped++;
          await ctx.db.insert("jobEvents", {
            runId: run._id,
            level: "warning",
            message: `${source.fullName}: contract identity could not be resolved; skipped`,
            createdAt: Date.now(),
          });
          continue;
        }
        const counts = await writeNhlContracts(
          ctx,
          observations.map((row) => ({ ...row, playerId: player._id })),
          run.apply,
        );
        if (run.apply || item.firstContract !== false)
          progress.contractsInserted += counts.contractsInserted;
        progress.contractsUpdated += counts.contractsUpdated;
        progress.seasonsInserted += counts.seasonsInserted;
        const salary = candidatesFromPuckPedia(
          [source],
          item.year,
          item.token,
        )[0];
        if (salary && run.apply) {
          const previous = await ctx.db
            .query("playerNhlSalaries")
            .withIndex("by_playerId_seasonStartYear", (q) =>
              q.eq("playerId", player._id).eq("seasonStartYear", item.year),
            )
            .unique();
          const data = {
            playerId: player._id,
            nhlApiId: source.nhlApiId,
            season: seasonLabel(item.year),
            seasonStartYear: item.year,
            salary: salary.salary,
            capHit: salary.capHit,
            salaryCap: salary.salaryCap,
            normalizedSalary: salary.salaryCap
              ? (salary.salary * 100_000_000) / salary.salaryCap
              : null,
            source: "puckpedia",
            sourceRef: item.token,
          };
          if (!previous)
            await ctx.db.insert("playerNhlSalaries", {
              ...data,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
          else if (
            Object.entries(data).some(
              ([key, value]) =>
                previous[key as keyof typeof previous] !== value,
            )
          )
            await ctx.db.patch(previous._id, {
              ...data,
              updatedAt: Date.now(),
            });
        }
      }
      if (!player && !run.apply && audit.rows.length) {
        if (item.firstContract !== false) progress.contractsInserted++;
        progress.seasonsInserted++;
      }
    }
    await ctx.db.patch(run._id, {
      cursor: String(args.offset + args.rows.length),
      progress,
      heartbeatAt: Date.now(),
    });
    return true;
  },
});

export const process = internalAction({
  args: { runId: v.id("jobRuns"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const blob = await ctx.storage.get(args.storageId);
    if (!blob || blob.size > 20_000_000)
      throw new Error("Missing or oversized PuckPedia snapshot");
    const snapshot = JSON.parse(await blob.text()) as Snapshot;
    if (
      !Number.isFinite(snapshot.capturedAt) ||
      snapshot.sources?.length !== 2 ||
      snapshot.sources[1]!.seasonStartYear !==
        snapshot.sources[0]!.seasonStartYear + 1 ||
      !snapshot.sources[0]!.players.length
    )
      throw new Error("Incomplete PuckPedia snapshot");
    const rows = snapshot.sources.flatMap((source, index) =>
      source.players.map((player) => ({
        player,
        year: source.seasonStartYear,
        token: source.seasonToken,
        current: index === 0,
      })),
    );
    const seenPlayers = new Set<string>();
    const seenContracts = new Set<string>();
    const observations = rows.map((row) => {
      const key = JSON.stringify([
        row.player.nhlApiId,
        row.player.contractStartYear,
        row.player.signingDate,
      ]);
      const firstPlayer = !seenPlayers.has(row.player.nhlApiId);
      const firstContract = !seenContracts.has(key);
      seenPlayers.add(row.player.nhlApiId);
      seenContracts.add(key);
      return { ...row, firstPlayer, firstContract };
    });
    if (rows.length > 15_000)
      throw new Error("PuckPedia snapshot exceeds directory limit");
    for (const { player, year, token } of rows) {
      if (
        !Number.isInteger(year) ||
        year < 2000 ||
        year > 2200 ||
        typeof token !== "string" ||
        !player.nhlApiId ||
        !player.firstName ||
        !player.lastName ||
        !Array.isArray(player.positions)
      )
        throw new Error("Invalid PuckPedia directory identity");
    }
    if (!(await ctx.runMutation(internal.puckpedia.initialize, args))) return;
    for (let offset = 0; offset < rows.length; offset += 20) {
      if (
        !(await ctx.runMutation(internal.puckpedia.batch, {
          runId: args.runId,
          offset,
          rows: observations.slice(offset, offset + 20),
          capturedAt: snapshot.capturedAt,
        }))
      )
        return;
    }
    await ctx.runMutation(internal.puckpedia.complete, { runId: args.runId });
  },
});

export const complete = internalMutation({
  args: { runId: v.id("jobRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    await finishJob(ctx, {
      ...args,
      status: "succeeded",
      result: run?.progress,
    });
  },
});

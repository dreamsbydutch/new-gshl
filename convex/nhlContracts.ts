import { v, type Infer } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { nhlContractObservation } from "./lib/nhlContractFields";
import {
  changedNhlContractFields,
  mergeNhlContractFields,
} from "./lib/nhlContractMerge";

const args = {
  serverSecret: v.string(),
  rows: v.array(nhlContractObservation),
};
type Observation = Infer<typeof nhlContractObservation>;

function authorize(secret: string) {
  if (
    !process.env.CONVEX_SERVER_SECRET ||
    secret !== process.env.CONVEX_SERVER_SECRET
  ) {
    throw new Error("Unauthorized server request");
  }
}

async function plan(ctx: QueryCtx, rows: Observation[]) {
  const first = rows[0];
  if (!first || rows.length > 30)
    throw new Error("Expected 1–30 seasons for one NHL contract");
  if (!(await ctx.db.get(first.playerId)))
    throw new Error("Unknown NHL contract player");
  const seen = new Set<number>();
  for (const row of rows) {
    if (
      row.playerId !== first.playerId ||
      row.signingDate !== first.signingDate ||
      row.startSeasonStartYear !== first.startSeasonStartYear ||
      row.source !== first.source ||
      row.length !== first.length ||
      row.expirySeasonStartYear !== first.expirySeasonStartYear
    ) {
      throw new Error("Batch must identify one NHL contract and source");
    }
    if (seen.has(row.seasonStartYear))
      throw new Error("Duplicate NHL contract season");
    seen.add(row.seasonStartYear);
    if (
      ![
        row.seasonStartYear,
        row.startSeasonStartYear,
        row.expirySeasonStartYear,
      ].every((y) => Number.isInteger(y) && y >= 1900 && y <= 2200) ||
      !Number.isInteger(row.length) ||
      row.length < 1 ||
      row.length > 30 ||
      !Number.isFinite(row.signingDate) ||
      row.signingDate % 86_400_000 !== 0 ||
      !Number.isFinite(row.capHit) ||
      row.capHit < 0 ||
      (row.cashSalary !== undefined &&
        (!Number.isFinite(row.cashSalary) || row.cashSalary < 0))
    ) {
      throw new Error("Invalid NHL contract dates, term, or compensation");
    }
  }
  const latest = [...rows].sort(
    (a, b) => b.seasonStartYear - a.seasonStartYear,
  )[0]!;
  const existing = await ctx.db
    .query("nhlContracts")
    .withIndex("by_playerId_startSeasonStartYear_signingDate", (q) =>
      q
        .eq("playerId", first.playerId)
        .eq("startSeasonStartYear", first.startSeasonStartYear)
        .eq("signingDate", first.signingDate),
    )
    .unique();
  const contractData = {
    playerId: latest.playerId,
    signingDate: latest.signingDate,
    startSeasonStartYear: latest.startSeasonStartYear,
    expirySeasonStartYear: latest.expirySeasonStartYear,
    length: latest.length,
    signingAge: latest.signingAge,
    signingStatus: latest.signingStatus,
    expiryStatus: latest.expiryStatus,
    signingAgent: latest.signingAgent,
    signingGm: latest.signingGm,
    source: latest.source,
    sourceRef: latest.sourceRef,
    historicalContractId: latest.historicalContractId,
    observationSeasonStartYear: latest.seasonStartYear,
  };
  // Keep the most recent season's contract metadata; live data takes precedence.
  const contract = mergeNhlContractFields(
    existing,
    contractData,
    existing?.source === latest.source &&
      existing.observationSeasonStartYear > latest.seasonStartYear,
  );
  const seasons = [];
  for (const row of rows) {
    const stored = existing
      ? await ctx.db
          .query("nhlContractSeasons")
          .withIndex("by_contractId_seasonStartYear", (q) =>
            q
              .eq("contractId", existing._id)
              .eq("seasonStartYear", row.seasonStartYear),
          )
          .unique()
      : null;
    const data = mergeNhlContractFields(stored, {
      playerId: row.playerId,
      seasonStartYear: row.seasonStartYear,
      capHit: row.capHit,
      cashSalary: row.cashSalary,
      clauses: row.clauses,
      status: row.status,
      source: row.source,
      sourceRef: row.sourceRef,
      historicalValues: row.historicalValues,
      identityMatchNote: row.identityMatchNote,
      identityMatchSource: row.identityMatchSource,
    });
    seasons.push({
      existing: stored,
      data,
      changed: !stored || changedNhlContractFields(stored, data),
    });
  }
  const contractChanged =
    !existing || changedNhlContractFields(existing, contract);
  const summary = {
    contractsInserted: existing ? 0 : 1,
    contractsUpdated: existing && contractChanged ? 1 : 0,
    seasonsInserted: seasons.filter((s) => !s.existing).length,
    seasonsUpdated: seasons.filter((s) => s.existing && s.changed).length,
    seasonsUnchanged: seasons.filter((s) => !s.changed).length,
  };
  return { existing, contract, contractChanged, seasons, summary };
}

export const preview = query({
  args,
  handler: async (ctx, input) => {
    authorize(input.serverSecret);
    return (await plan(ctx, input.rows)).summary;
  },
});

export async function writeNhlContracts(
  ctx: MutationCtx,
  rows: Observation[],
  apply = true,
) {
  const result = await plan(ctx, rows);
  if (!apply) return result.summary;
  const now = Date.now();
  const contractId =
    result.existing?._id ??
    (await ctx.db.insert("nhlContracts", {
      ...result.contract,
      firstObservedAt: now,
      lastObservedAt: now,
      updatedAt: now,
    }));
  if (result.existing) {
    // Observation timestamps may advance on an otherwise idempotent live sync.
    await ctx.db.patch(contractId, {
      ...result.contract,
      lastObservedAt:
        rows[0]!.source === "puckpedia" ? now : result.existing.lastObservedAt,
      updatedAt: result.contractChanged ? now : result.existing.updatedAt,
    });
  }
  for (const season of result.seasons) {
    if (season.existing) {
      await ctx.db.patch(season.existing._id, {
        ...season.data,
        lastObservedAt:
          rows[0]!.source === "puckpedia"
            ? now
            : season.existing.lastObservedAt,
        updatedAt: season.changed ? now : season.existing.updatedAt,
      });
    } else {
      await ctx.db.insert("nhlContractSeasons", {
        ...season.data,
        contractId,
        firstObservedAt: now,
        lastObservedAt: now,
        updatedAt: now,
      });
    }
  }
  return result.summary;
}

export const upsert = mutation({
  args,
  handler: async (ctx, input) => {
    authorize(input.serverSecret);
    return writeNhlContracts(ctx, input.rows);
  },
});

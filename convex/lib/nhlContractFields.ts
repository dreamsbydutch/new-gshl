import { v, type Infer } from "convex/values";

export const nhlContractSource = v.union(
  v.literal("historical-json"),
  v.literal("puckpedia"),
  v.literal("player-profile"),
);

export const nhlContractFields = {
  playerId: v.id("players"),
  signingDate: v.number(),
  startSeasonStartYear: v.number(),
  expirySeasonStartYear: v.number(),
  length: v.number(),
  signingAge: v.optional(v.number()),
  signingStatus: v.optional(v.string()),
  expiryStatus: v.optional(v.string()),
  signingAgent: v.optional(v.string()),
  signingGm: v.optional(v.string()),
};

export const nhlContractSeasonFields = {
  seasonStartYear: v.number(),
  capHit: v.number(),
  cashSalary: v.optional(v.number()),
  clauses: v.optional(v.string()),
  status: v.optional(v.string()),
  identityMatchNote: v.optional(v.string()),
  identityMatchSource: v.optional(v.string()),
};

export const nhlContractObservation = v.object({
  ...nhlContractFields,
  ...nhlContractSeasonFields,
  source: nhlContractSource,
  sourceRef: v.string(),
  historicalContractId: v.optional(v.string()),
  historicalValues: v.optional(v.record(v.string(), v.string())),
});

export type NhlContractInput = Infer<typeof nhlContractObservation>;

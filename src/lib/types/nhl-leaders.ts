import type { z } from "zod";
import type { nhlLeadersSchema } from "../utils/features/nhl-leaders";

export type NHLLeaders = z.infer<typeof nhlLeadersSchema>;
export type NHLLeader = NHLLeaders["skaters"][number];
export type NHLLeaderStat = keyof NHLLeader["stats"];

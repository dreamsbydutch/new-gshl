import { v } from "convex/values";

const stat = v.union(v.number(), v.null());
export const nightlyPlayerFields = {
  posGroup: v.union(v.literal("F"), v.literal("D"), v.literal("G")),
  nhlPos: v.array(v.string()),
  nhlTeam: v.array(v.string()),
  GP: stat,
  GS: stat,
  G: stat,
  A: stat,
  P: stat,
  PM: stat,
  PIM: stat,
  PPP: stat,
  SOG: stat,
  HIT: stat,
  BLK: stat,
  W: stat,
  GA: stat,
  GAA: stat,
  SV: stat,
  SA: stat,
  SVP: stat,
  SO: stat,
  QS: stat,
  RBS: stat,
  TOI: stat,
  seasonRating: v.number(),
};
export const nightlyTeamFields = {
  GP: v.number(),
  W: v.number(),
  L: v.number(),
  OTL: v.number(),
  P: v.number(),
  GF: v.number(),
  GA: v.number(),
};

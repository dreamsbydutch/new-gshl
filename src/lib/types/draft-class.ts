import type { Contract, Player } from "./database";

export type DraftClassCertainty = "all" | "guaranteed" | "projected";
export type DraftClassPosition = "all" | "F" | "D" | "G";

export interface DraftClassRow {
  player: Player;
  expiringContract?: Contract;
  isGuaranteedUfa: boolean;
}

export interface DraftClassSummary {
  available: number;
  guaranteedUfas: number;
  goalies: number;
  averageRating: number | null;
}

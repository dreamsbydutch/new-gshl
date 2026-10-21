import type { NhlTalentPosition } from "./nhl-contract-talent-forecast";

export interface NhlTalentPeerAging {
  version: "nhl-talent-peer-aging-v1";
  throughYear: number;
  position: NhlTalentPosition;
  playerId: number;
  originYear: number;
  curve: { peakAge: number; developmentRate: number; declineRate: number };
  blendWeight: number;
  similarityWeight: number;
  effectivePeers: number;
  selectedPeers: number;
  contributingPeers: number;
  pairs: number;
  nearest: Array<{
    nhlPlayerId: number;
    originYear: number;
    distance: number;
    weight: number;
  }>;
  selection: {
    ageWindow: 2;
    maximumPeers: 60;
    priorPeers: 20;
    garScale: number;
    changeScale: number;
    minutesScale: number;
    outcomeBlind: true;
    description: string;
  };
}

export interface NhlTalentPeerCalibrationRow {
  nhlPlayerId: number;
  originYear: number;
  targetYear: number;
  horizon: number;
  group: string | null;
  target: number;
  positionPrediction: number;
  peerPrediction: number;
}
export interface NhlTalentPeerCalibrationFit {
  weight: number;
  rows: number;
  origins: number;
  players: number;
  crossProduct: number;
  sumSquaredDifference: number;
  ridge: 100;
  supported: boolean;
}
export interface NhlTalentPeerCalibration {
  version: "nhl-talent-peer-calibration-v1";
  throughYear: number;
  overall: NhlTalentPeerCalibrationFit;
  groups: Record<string, NhlTalentPeerCalibrationFit>;
}

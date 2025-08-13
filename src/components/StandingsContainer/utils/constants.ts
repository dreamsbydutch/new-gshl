// Conference abbreviations
export const CONFERENCE_ABBREVIATIONS = {
  SUNVIEW: "SV",
  HICKORY_HOTEL: "HH",
} as const;

// Conference titles
export const CONFERENCE_TITLES = {
  SUNVIEW: "Sunview",
  HICKORY_HOTEL: "Hickory Hotel",
} as const;

// Standings types
export const STANDINGS_TYPES = {
  OVERALL: "overall",
  CONFERENCE: "conference",
  WILDCARD: "wildcard",
} as const;

// Overall seed fields for playoff probabilities
export const OVERALL_SEED_FIELDS = [
  "OneSeed",
  "TwoSeed",
  "ThreeSeed",
  "FourSeed",
  "FiveSeed",
  "SixSeed",
  "SevenSeed",
  "EightSeed",
  "NineSeed",
  "TenSeed",
  "ElevenSeed",
  "TwelveSeed",
  "ThirteenSeed",
  "FourteenSeed",
  "FifteenSeed",
  "SixteenSeed",
] as const;

// Conference seed fields for playoff probabilities
export const CONFERENCE_SEED_FIELDS = [
  "OneConf",
  "TwoConf",
  "ThreeConf",
  "FourConf",
  "FiveConf",
  "SixConf",
  "SevenConf",
  "EightConf",
] as const;

// Wildcard probability fields
export const WILDCARD_FIELDS = [
  "PlayoffsPer",
  "LoserPer",
  "SFPer",
  "FinalPer",
  "CupPer",
] as const;

// Losers tourney probability fields
export const LOSERS_TOURNEY_FIELDS = [
  "1stPickPer",
  "3rdPickPer",
  "4thPickPer",
  "8thPickPer",
] as const;

// Wildcard team limits
export const WILDCARD_TEAM_LIMITS = {
  CONFERENCE_TEAMS: 3,
  WILDCARD_START_INDEX: 6,
} as const;

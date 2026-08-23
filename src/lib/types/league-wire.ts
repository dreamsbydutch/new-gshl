export type LeagueWirePostKind =
  | "trade"
  | "trade_block"
  | "draft_pick"
  | "ufa_offer"
  | "ufa_result"
  | "add"
  | "drop"
  | "missed_start"
  | "matchup_final"
  | "three_stars"
  | "power_ranking"
  | "press_box"
  | "announcement";

export interface LeagueWireLink {
  label: string;
  href: string;
}

export interface LeagueWireTeam {
  id: string;
  name: string;
  abbr: string;
  logoUrl: string;
}

export interface LeagueWireTradeAsset {
  label: string;
  playerId: string | null;
  draftPickId: string | null;
}

export interface LeagueWireTradePackage {
  teamId: string;
  teamName: string;
  assets: LeagueWireTradeAsset[];
}

export interface LeagueWirePost {
  id: string;
  kind: LeagueWirePostKind;
  occurredAt: string;
  title: string;
  summary: string | null;
  body: string | null;
  links: LeagueWireLink[];
  teams: LeagueWireTeam[];
  tradePackages: LeagueWireTradePackage[] | null;
}

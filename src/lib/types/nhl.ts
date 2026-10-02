import type { z } from "zod";
import type {
  nhlStandingsResponseSchema,
  nhlScheduleResponseSchema,
  nhlGameResponseSchema,
  nhlBoxscorePlayerSchema,
} from "../utils/features/nhl";

export type NHLStandings = z.infer<typeof nhlStandingsResponseSchema>;
export type NHLSchedule = z.infer<typeof nhlScheduleResponseSchema>;
export type NHLGame = z.infer<typeof nhlGameResponseSchema>;
export type NHLBoxscorePlayer = z.infer<typeof nhlBoxscorePlayerSchema>;

export interface NHLMatchupPlayerRow {
  id: string;
  nhlPlayerId?: number | null;
  fullName: string;
  position: string;
  goalie: boolean;
  side: "away" | "home";
  gshlTeam: {
    id: string;
    name: string | null;
    abbr: string | null;
    logoUrl: string | null;
  };
  lineupPosition: string | null;
  lineupStatus: "Started" | "Bench" | "Out" | "Planned" | "Not recorded";
  stats: NHLBoxscorePlayer | null;
}

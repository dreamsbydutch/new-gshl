import type { z } from "zod";
import type {
  nhlStandingsResponseSchema,
  nhlScheduleResponseSchema,
} from "../utils/features/nhl";

export type NHLStandings = z.infer<typeof nhlStandingsResponseSchema>;
export type NHLSchedule = z.infer<typeof nhlScheduleResponseSchema>;

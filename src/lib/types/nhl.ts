import type { z } from "zod";
import type {
  nhlStandingsSchema,
  nhlScheduleSchema,
} from "../utils/features/nhl";

export type NHLStandings = z.infer<typeof nhlStandingsSchema>;
export type NHLSchedule = z.infer<typeof nhlScheduleSchema>;

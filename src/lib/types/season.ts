import type { Season } from "./database";

export type SeasonSummary = {
  id: string;
  name: string;
  year: number;
};

export interface OffseasonWindow {
  endedSeason: Season;
  upcomingSeason: Season;
}

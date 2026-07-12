import type { Season } from "./database";

export interface OffseasonWindow {
  endedSeason: Season;
  upcomingSeason: Season;
}

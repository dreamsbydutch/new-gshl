import {
  fetchYahooMatchupPage,
  closeYahooBrowserSession,
} from "../../domains/yahoo/matchup-utils";
import { parseDailyYahooRoster } from "../../domains/yahoo/daily-roster";

export { closeYahooBrowserSession };

export async function fetchDailyYahooRoster(
  leagueId: string,
  teamId: string,
  date: string,
) {
  const url = `https://hockey.fantasysports.yahoo.com/hockey/${leagueId}/${teamId}?date=${date}`;
  let html: string;
  try {
    html = await fetchYahooMatchupPage(url, 3500);
  } catch {
    // The legacy transport may embed authenticated HTML in its error message.
    throw new Error(
      `Yahoo roster fetch failed for team ${teamId}. Check Yahoo session/browser configuration.`,
    );
  }
  return parseDailyYahooRoster(html, { leagueId, teamId, date });
}

import { setTimeout as delay } from "node:timers/promises";
import { parseExpectedGoalRows } from "../../domains/nhl/expected-goal-input";

/** Documented public download endpoints only, not website scraping. */
export async function fetchExpectedGoalCsv(
  season: number,
  gameType: 2 | 3,
  kind: "skaters" | "goalies",
) {
  const year = Math.floor(season / 10000);
  if (
    !Number.isInteger(season) ||
    year < 2008 ||
    season % 10000 !== year + 1 ||
    ![2, 3].includes(gameType)
  )
    throw new Error("Invalid expected-goal source season/game type");
  const url = `https://www.moneypuck.com/moneypuck/playerData/seasonSummary/${year}/${gameType === 2 ? "regular" : "playoffs"}/${kind}.csv`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok)
        throw new Error(
          `MoneyPuck HTTP ${response.status} for ${year}/${kind}`,
        );
      const text = await response.text();
      parseExpectedGoalRows(text, season, kind === "goalies");
      return { url, fetchedAt: new Date().toISOString(), text };
    } catch (error) {
      if (attempt === 2) throw error;
      await delay(1000 * 2 ** attempt);
    }
  }
  throw new Error("MoneyPuck request exhausted");
}

/** Public NHL game states let the hourly roster worker observe the final lock. */
export async function fetchDailyGameStatus(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("Invalid NHL schedule date.");
  const response = await fetch(`https://api-web.nhle.com/v1/schedule/${date}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(`NHL schedule request failed (${response.status}).`);
  const body = (await response.json()) as {
    gameWeek?: {
      date: string;
      games: { gameState: string; gameScheduleState: string }[];
    }[];
  };
  const day = body.gameWeek?.find((row) => row.date === date);
  if (
    !day ||
    !Array.isArray(day.games) ||
    day.games.some(
      (game) =>
        typeof game.gameState !== "string" ||
        typeof game.gameScheduleState !== "string",
    )
  )
    throw new Error(
      "NHL schedule does not confirm the requested date's game states.",
    );
  return day.games.map(({ gameState, gameScheduleState }) => ({
    gameState,
    gameScheduleState,
  }));
}

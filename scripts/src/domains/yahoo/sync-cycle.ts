export type YahooSyncCheckpoint = {
  lastNhlSyncAt?: number;
  lastYahooSyncAt?: number;
  lockedRosterDates?: string[];
  reconciledThrough?: string;
  morningRecheckOn?: string;
};

export function shiftYahooDate(date: string, offset: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

/** Date boundaries and morning final-stat catch-up always use Toronto time. */
export function planYahooSyncCycle(input: {
  now: Date;
  startDate: string;
  endDate: string;
  checkpoint: YahooSyncCheckpoint;
  games?: { gameState: string; gameScheduleState: string }[];
}) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(input.now);
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === name)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const hour = Number(part("hour"));
  const active = input.startDate <= today && today <= input.endDate;
  const windowOpen = hour >= 8 && hour <= 22;
  const hourDue = (last?: number) =>
    !last ||
    Math.floor(input.now.getTime() / 3600000) > Math.floor(last / 3600000);
  const rosterLocked =
    input.checkpoint.lockedRosterDates?.includes(today) ?? false;
  const games = input.games?.filter(
    (g) => !["PPD", "CNCL"].includes(g.gameScheduleState),
  );
  const allGamesStarted =
    !!games?.length &&
    games.every((g) => ["LIVE", "CRIT", "FINAL", "OFF"].includes(g.gameState));
  const scrapeYahoo =
    active &&
    windowOpen &&
    !rosterLocked &&
    hourDue(input.checkpoint.lastYahooSyncAt);
  const refreshNhl =
    active && windowOpen && hourDue(input.checkpoint.lastNhlSyncAt);
  const closedThrough = [
    input.endDate,
    shiftYahooDate(today, hour >= 8 ? -1 : -2),
  ].sort()[0]!;
  const firstMissing = input.checkpoint.reconciledThrough
    ? shiftYahooDate(input.checkpoint.reconciledThrough, 1)
    : [input.startDate, shiftYahooDate(closedThrough, -1)].sort().at(-1)!;
  const dates = new Set<string>();
  for (
    let date = firstMissing;
    date <= closedThrough && dates.size < 2;
    date = shiftYahooDate(date, 1)
  )
    if (date >= input.startDate) dates.add(date);
  const recent = [shiftYahooDate(today, -2), shiftYahooDate(today, -1)].filter(
    (date) => date >= input.startDate && date <= input.endDate,
  );
  if (
    windowOpen &&
    input.checkpoint.morningRecheckOn !== today &&
    today <= shiftYahooDate(input.endDate, 2)
  ) {
    for (const date of recent) if (dates.size < 2) dates.add(date);
  }
  return {
    today,
    active,
    windowOpen,
    scrapeYahoo,
    allGamesStarted,
    refreshNhl,
    historyDates: windowOpen ? [...dates].sort() : [],
    recent,
    morning: windowOpen,
  };
}

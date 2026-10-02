export type YahooSyncCheckpoint = {
  lastNhlSyncAt?: number;
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
  const refreshNhl =
    active &&
    (!input.checkpoint.lastNhlSyncAt ||
      input.now.getTime() - input.checkpoint.lastNhlSyncAt >= 60 * 60 * 1000);
  const closedThrough = [
    input.endDate,
    shiftYahooDate(today, hour >= 6 ? -1 : -2),
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
    hour >= 6 &&
    input.checkpoint.morningRecheckOn !== today &&
    today <= shiftYahooDate(input.endDate, 2)
  ) {
    for (const date of recent) if (dates.size < 2) dates.add(date);
  }
  return {
    today,
    active,
    refreshNhl,
    historyDates: [...dates].sort(),
    recent,
    morning: hour >= 6,
  };
}

import { load } from "cheerio";
import { penaltyShotEventIds } from "./game-value-input";

export type PenaltyShotGameTotal = {
  gameId: number;
  playerId: number;
  penaltyShotAttempts: number;
  penaltyShotsGoals: number;
};
type ReportGame = {
  id: number;
  gameDate: string;
  rosterSpots: Array<{
    playerId: number;
    sweaterNumber: number;
    lastName: { default: string };
  }>;
  plays: Array<{
    eventId: number;
    periodDescriptor: { number: number; periodType: string };
    timeInPeriod: string;
    typeDescKey: string;
    details?: Record<string, unknown>;
  }>;
};
const normalized = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

export function penaltyShotGameMatches(
  raw: unknown,
  totals: PenaltyShotGameTotal[],
) {
  const game = raw as ReportGame;
  const ids = penaltyShotEventIds(raw);
  const actual = new Map<number, { attempts: number; goals: number }>();
  for (const p of game.plays.filter((p) => ids.has(p.eventId))) {
    const id = Number(
      p.details?.shootingPlayerId ?? p.details?.scoringPlayerId,
    );
    const total = actual.get(id) ?? { attempts: 0, goals: 0 };
    total.attempts++;
    total.goals += p.typeDescKey === "goal" ? 1 : 0;
    actual.set(id, total);
  }
  return (
    new Set(totals.map((p) => p.playerId)).size === totals.length &&
    totals.every(
      (p) =>
        p.gameId === game.id &&
        (actual.get(p.playerId)?.attempts ?? 0) === p.penaltyShotAttempts &&
        (actual.get(p.playerId)?.goals ?? 0) === p.penaltyShotsGoals,
    ) &&
    [...actual.keys()].every((id) => totals.some((p) => p.playerId === id))
  );
}

/** Match an explicit official HTML penalty-shot label to a unique existing NHL event. */
export function parseOfficialPenaltyShots(
  html: string,
  raw: unknown,
  totals: PenaltyShotGameTotal[],
) {
  const game = raw as ReportGame;
  const page = load(html);
  const cells = page("td")
    .toArray()
    .map((td) => page(td).text().replace(/\s+/g, " ").trim());
  const date = new Date(game.gameDate + "T00:00:00Z");
  const expectedDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  if (
    !/Play By Play/i.test(page("title").text()) ||
    !cells.some(
      (s) =>
        /^Game\s+\d+$/.test(s) &&
        Number(s.match(/\d+/)![0]) === game.id % 10000,
    ) ||
    !cells.includes(expectedDate) ||
    totals.some((t) => t.gameId !== game.id)
  )
    throw new Error("Wrong penalty-shot report scope");
  const ids = new Set<number>();
  page("tr").each((_, tr) => {
    const columns = page(tr).children("td");
    if (columns.length < 6) return;
    const period = Number(page(columns[1]).text().trim());
    if (
      game.plays.some(
        (p) =>
          p.periodDescriptor.number === period &&
          p.periodDescriptor.periodType === "SO",
      )
    )
      return;
    const clock = page(columns[3])
      .text()
      .trim()
      .match(/^\d+:\d{2}/)?.[0];
    const kind = page(columns[4]).text().trim();
    const description = page(columns[5]).text().replace(/\s+/g, " ").trim();
    if (
      !["SHOT", "MISS", "GOAL"].includes(kind) ||
      !/Penalty Shot/i.test(description)
    )
      return;
    const shooter = description.match(/#(\d+)\s+([^,]+)/);
    if (!shooter || !Number.isInteger(period) || !clock)
      throw new Error("Malformed official penalty-shot label");
    const roster = game.rosterSpots.filter(
      (p) =>
        p.sweaterNumber === Number(shooter[1]) &&
        normalized(p.lastName.default) === normalized(shooter[2]!) &&
        totals.some((t) => t.playerId === p.playerId),
    );
    const types =
      kind === "GOAL"
        ? ["goal"]
        : kind === "SHOT"
          ? ["shot-on-goal"]
          : ["missed-shot", "failed-shot-attempt"];
    const matches = game.plays.filter(
      (p) =>
        p.periodDescriptor.periodType !== "SO" &&
        p.periodDescriptor.number === period &&
        p.timeInPeriod.replace(/^0(?=\d:)/, "") ===
          clock.replace(/^0(?=\d:)/, "") &&
        types.includes(p.typeDescKey) &&
        roster.some(
          (r) =>
            r.playerId ===
            Number(p.details?.shootingPlayerId ?? p.details?.scoringPlayerId),
        ),
    );
    if (matches.length !== 1 || ids.has(matches[0]!.eventId))
      throw new Error("Ambiguous official penalty-shot event match");
    ids.add(matches[0]!.eventId);
  });
  const plays = game.plays.map((p) =>
    ids.has(p.eventId)
      ? { ...p, details: { ...p.details, nhlReportPenaltyShot: true } }
      : p,
  );
  if (!penaltyShotGameMatches({ ...game, plays }, totals))
    throw new Error("Official HTML and NHL penalty-shot totals differ");
  return [...ids].sort((a, b) => a - b);
}

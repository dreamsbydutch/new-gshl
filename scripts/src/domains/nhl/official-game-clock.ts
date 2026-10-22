import { load } from "cheerio";

export type OfficialPeriodEnd = { period: number; seconds: number };

/** A final official scoring summary can locate a missing overtime tail without
 * supplying the absent goal's event identity, geometry or player value. */
export function parseOfficialOvertimeEnd(
  html: string,
  raw: unknown,
): OfficialPeriodEnd {
  const game = raw as {
    id: number;
    gameType: number;
    gameState: string;
    gameDate: string;
    gameOutcome: { lastPeriodType: string; otPeriods: number };
    homeTeam: { id: number; abbrev: string; score: number };
    awayTeam: { id: number; abbrev: string; score: number };
    plays: Array<{
      periodDescriptor: { number: number; periodType: string };
      timeInPeriod: string;
    }>;
  };
  if (
    !Number.isInteger(game.id) ||
    game.gameType !== 2 ||
    game.gameState !== "OFF" ||
    game.gameOutcome?.lastPeriodType !== "OT" ||
    game.gameOutcome.otPeriods !== 1 ||
    !Array.isArray(game.plays) ||
    game.homeTeam.id === game.awayTeam.id ||
    ![game.homeTeam.score, game.awayTeam.score].every(
      (n) => Number.isInteger(n) && n >= 0,
    ) ||
    Math.abs(game.homeTeam.score - game.awayTeam.score) !== 1
  )
    throw new Error("Unsupported official overtime clock scope");
  const page = load(html),
    clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const cells = page("td")
    .toArray()
    .map((td) => clean(page(td).text()));
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(game.gameDate + "T00:00:00Z"));
  if (
    page("title").text().trim() !== "Game Summary" ||
    !cells.includes("Final") ||
    !cells.includes(date) ||
    !cells.some(
      (s) =>
        /^Game\s+\d+$/.test(s) && Number(s.split(/\s+/)[1]) === game.id % 10000,
    )
  )
    throw new Error("Wrong official overtime summary identity");
  const rows = page("tr")
    .toArray()
    .map((tr) =>
      page(tr)
        .children("td")
        .toArray()
        .map((td) => clean(page(td).text())),
    )
    .filter(
      (c) =>
        c.length === 10 && /^\d+$/.test(c[0]!) && /^(?:1|2|3|OT)$/.test(c[1]!),
    );
  const total = game.homeTeam.score + game.awayTeam.score;
  if (
    rows.length !== total ||
    rows.some(
      (r, i) =>
        Number(r[0]) !== i + 1 ||
        ![game.homeTeam.abbrev, game.awayTeam.abbrev].includes(r[4]!),
    ) ||
    rows.filter((r) => r[4] === game.homeTeam.abbrev).length !==
      game.homeTeam.score ||
    rows.filter((r) => r[4] === game.awayTeam.abbrev).length !==
      game.awayTeam.score ||
    rows.filter((r) => r[1] === "OT").length !== 1 ||
    rows.at(-1)?.[1] !== "OT"
  )
    throw new Error("Official overtime scoring summary does not reconcile");
  const final = rows.at(-1)!,
    winner =
      game.homeTeam.score > game.awayTeam.score
        ? game.homeTeam.abbrev
        : game.awayTeam.abbrev;
  const time = final[2]!.match(/^(\d{1,2}):([0-5]\d)$/);
  const seconds = time ? Number(time[1]) * 60 + Number(time[2]) : NaN;
  if (
    final[4] !== winner ||
    !Number.isInteger(seconds) ||
    seconds <= 0 ||
    seconds > 300 ||
    !game.plays.some(
      (p) =>
        p.periodDescriptor.number === 4 &&
        p.periodDescriptor.periodType === "OT",
    ) ||
    game.plays.some((p) => {
      const t = p.timeInPeriod.match(/^(\d{1,2}):([0-5]\d)$/);
      return (
        p.periodDescriptor.number > 4 ||
        (p.periodDescriptor.number === 4 &&
          (p.periodDescriptor.periodType !== "OT" ||
            !t ||
            Number(t[1]) * 60 + Number(t[2]) > seconds))
      );
    })
  )
    throw new Error("Official overtime end conflicts with native clocks");
  return { period: 4, seconds };
}

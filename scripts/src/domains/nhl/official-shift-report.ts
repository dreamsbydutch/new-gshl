import { load } from "cheerio";
import { clockSeconds } from "./game-value-input";

type RosterSpot = {
  teamId: number;
  playerId: number;
  sweaterNumber: number;
  positionCode?: string;
  lastName: { default: string };
};
type ReportGame = {
  id: number;
  gameDate: string;
  homeTeam: { id: number };
  awayTeam: { id: number };
  rosterSpots: RosterSpot[];
};
const normalized = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

/** Official HTML backup for gaps in shiftcharts. Team/jersey identifies players; names only verify the join. */
export function parseOfficialShiftReport(
  html: string,
  rawGame: unknown,
  home: boolean,
  apiShifts: unknown[] = [],
  goaliePeriodsOnly = false,
) {
  const game = rawGame as ReportGame;
  if (!Number.isInteger(game.id) || !Array.isArray(game.rosterSpots))
    throw new Error("Missing official roster for shift report");
  const page = load(html);
  const title = page("title").text().trim();
  if (title !== `Time On Ice Report ${home ? "Home" : "Away"} Team`)
    throw new Error("Wrong shift report side");
  const cells = page("td")
    .toArray()
    .map((td) => page(td).text().replace(/\s+/g, " ").trim());
  if (
    !cells.some((s) => {
      const match = s.match(/^Game\s+(\d+)$/);
      return match && Number(match[1]) === game.id % 10000;
    })
  )
    throw new Error("Wrong shift report game");
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const date = cells
    .map((s) =>
      s.match(
        /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\w+) (\d{1,2}), (\d{4})$/,
      ),
    )
    .find(Boolean);
  const month = date ? months.indexOf(date[1]!) : -1;
  if (
    !date ||
    month < 0 ||
    new Date(Date.UTC(Number(date[3]), month, Number(date[2])))
      .toISOString()
      .slice(0, 10) !== game.gameDate
  )
    throw new Error("Wrong shift report date");
  const teamId = home ? game.homeTeam.id : game.awayTeam.id;
  const roster = game.rosterSpots.filter((p) => p.teamId === teamId);
  const rows: Array<{
    id: string;
    gameId: number;
    playerId: number;
    teamId: number;
    period: number;
    startTime: string;
    endTime: string;
    typeCode: number;
  }> = [];
  const seen = new Map<string, string>();
  let playerId: number | undefined;
  let summaryTable = false;
  page("tr").each((_, tr) => {
    const heading = page(tr).children("td.playerHeading");
    if (heading.length) {
      const label = heading
        .text()
        .trim()
        .match(/^(\d+)\s+(.+?),\s+.+$/);
      if (!label) throw new Error("Malformed shift report player heading");
      const candidates = roster.filter(
        (p) => p.sweaterNumber === Number(label[1]),
      );
      if (
        candidates.length !== 1 ||
        normalized(candidates[0]!.lastName.default) !== normalized(label[2]!)
      )
        throw new Error(`Unverified shift-report jersey ${label[1]}`);
      playerId = candidates[0]!.playerId;
      summaryTable = false;
      return;
    }
    const fields = page(tr)
      .children("td")
      .toArray()
      .map((td) => page(td).text().replace(/\s+/g, " ").trim());
    if (fields.join("|") === "Per|SHF|AVG|TOI|EV TOT|PP TOT|SH TOT") {
      summaryTable = true;
      return;
    }
    if (
      summaryTable &&
      fields.length === 7 &&
      /^\d+$/.test(fields[1]!) &&
      /^(?:[1-3]|OT)$/.test(fields[0]!)
    ) {
      const period = fields[0] === "OT" ? 4 : Number(fields[0]);
      const seconds =
        period <= 3 || Math.floor(game.id / 10000) % 100 === 3 ? 1200 : 300;
      // A goalie credited with every second of a complete period has one
      // uniquely determined interval. Partial-period totals cannot locate shifts.
      const existing = rows.filter(
        (r) => r.playerId === playerId && r.period === period,
      );
      if (
        roster.find((p) => p.playerId === playerId)?.positionCode === "G" &&
        clockSeconds(fields[3]) === seconds &&
        fields.slice(4).reduce((sum, value) => sum + clockSeconds(value), 0) ===
          seconds &&
        !existing.length
      ) {
        rows.push({
          id: `html-summary-${teamId}-${playerId}-${period}`,
          gameId: game.id,
          playerId: playerId!,
          teamId,
          period,
          startTime: "0:00",
          endTime: `${seconds / 60}:00`,
          typeCode: 517,
        });
      }
      // The API sometimes retains the final shift's start while the HTML
      // report omits its row. Recover that suffix only when its exact duration
      // closes the official period total, with no overlapping recorded shifts.
      const open = apiShifts.filter((raw) => {
        const s = raw as Record<string, unknown>;
        return (
          s.gameId === game.id &&
          s.teamId === teamId &&
          s.playerId === playerId &&
          s.period === period &&
          s.typeCode === 517 &&
          s.endTime === "" &&
          ["0:00", "00:00"].includes(String(s.duration))
        );
      }) as Array<Record<string, unknown>>;
      if (!goaliePeriodsOnly && existing.length && open.length === 1) {
        const startTime = String(open[0]!.startTime),
          start = clockSeconds(startTime);
        const ordered = [...existing].sort(
          (a, b) => clockSeconds(a.startTime) - clockSeconds(b.startTime),
        );
        const closedSeconds = existing.reduce(
          (n, r) => n + clockSeconds(r.endTime) - clockSeconds(r.startTime),
          0,
        );
        if (
          start < seconds &&
          ordered.every(
            (r, i) =>
              clockSeconds(r.endTime) <= start &&
              (!i ||
                clockSeconds(ordered[i - 1]!.endTime) <=
                  clockSeconds(r.startTime)),
          ) &&
          closedSeconds + seconds - start === clockSeconds(fields[3]) &&
          fields
            .slice(4)
            .reduce((sum, value) => sum + clockSeconds(value), 0) ===
            clockSeconds(fields[3])
        ) {
          rows.push({
            id: `html-api-suffix-${teamId}-${playerId}-${period}`,
            gameId: game.id,
            playerId: playerId!,
            teamId,
            period,
            startTime,
            endTime: `${seconds / 60}:00`,
            typeCode: 517,
          });
        }
      }
      return;
    }
    if (goaliePeriodsOnly) return;
    if (
      fields.length !== 6 ||
      !/^\d+$/.test(fields[0]!) ||
      !fields[2]!.includes("/") ||
      !fields[3]!.includes("/")
    )
      return;
    if (playerId === undefined)
      throw new Error("Shift report row has no verified player");
    if (fields[1] === "SO") return;
    const ot = fields[1]!.match(/^(\d*)OT$/);
    const period = ot ? 3 + Number(ot[1] || 1) : Number(fields[1]);
    const startTime = fields[2]!.split("/")[0]!.trim();
    let endTime = fields[3]!.split("/")[0]!.trim();
    const start = clockSeconds(startTime),
      duration = clockSeconds(fields[4]);
    let end = clockSeconds(endTime);
    // Some historical reports reset the elapsed end clock at the period horn.
    // Recover only when both remaining clocks and the duration independently
    // identify the same endpoint; never infer an endpoint from TOI totals.
    const periodSeconds =
      period <= 3 || Math.floor(game.id / 10000) % 100 === 3 ? 1200 : 300;
    if (
      end !== periodSeconds &&
      duration > 0 &&
      start + duration === periodSeconds &&
      clockSeconds(fields[2]!.split("/")[1]!.trim()) === duration &&
      clockSeconds(fields[3]!.split("/")[1]!.trim()) === 0
    ) {
      end = periodSeconds;
      endTime = `${periodSeconds / 60}:00`;
    }
    if (
      !Number.isInteger(period) ||
      period < 1 ||
      end < start ||
      Math.abs(end - start - duration) > 1
    )
      throw new Error("Invalid official report shift interval");
    const id = `html-${teamId}-${playerId}-${fields[0]}`;
    const row = {
      id,
      gameId: game.id,
      playerId,
      teamId,
      period,
      startTime,
      endTime,
      typeCode: 517,
    };
    const serialized = JSON.stringify(row);
    if (seen.has(id)) {
      if (seen.get(id) !== serialized)
        throw new Error("Conflicting repeated report shift");
      return;
    }
    seen.set(id, serialized);
    if (end > start) rows.push(row);
  });
  if (!rows.length)
    throw new Error("Official shift report contains no verified shifts");
  return rows;
}

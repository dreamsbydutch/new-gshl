import { load } from "cheerio";
import { clockSeconds } from "./game-value-input";

type RosterSpot = {
  teamId: number;
  playerId: number;
  sweaterNumber: number;
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
      return;
    }
    const fields = page(tr)
      .children("td")
      .toArray()
      .map((td) => page(td).text().trim());
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
    const startTime = fields[2]!.split("/")[0]!.trim(),
      endTime = fields[3]!.split("/")[0]!.trim();
    const start = clockSeconds(startTime),
      end = clockSeconds(endTime),
      duration = clockSeconds(fields[4]);
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

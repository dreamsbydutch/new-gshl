import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

export type RetainedBoundaryFixture = {
  pbp: {
    id: number;
    gameDate: string;
    gameType: number;
    homeTeam: { id: number };
    awayTeam: { id: number };
    rosterSpots: Array<{
      playerId: number;
      teamId: number;
      sweaterNumber: number;
      positionCode: string;
      firstName?: { default: string };
      lastName: { default: string };
    }>;
    plays: Array<{
      eventId: number;
      typeDescKey: string;
      periodDescriptor: { number: number; periodType: string };
      timeInPeriod: string;
      details?: Record<string, unknown>;
    }>;
  };
  box: {
    id: number;
    gameDate: string;
    playerByGameStats: Record<
      string,
      Record<string, Array<{ playerId: number; toi: string }>>
    >;
  };
  reports: { home: string; away: string };
  apiShifts: unknown[];
};
/** Compact public-source fixtures; original report bodies remain byte-exact. */
export function retainedBoundary2008Fixtures(): RetainedBoundaryFixture[] {
  const saved = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "./fixtures/reviewed-2008-boundary-reports.json.gz",
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  ) as { version: string; records: RetainedBoundaryFixture[] };
  if (
    saved.version !== "retained-2008-boundary-test-fixtures-v1" ||
    saved.records.length !== 20 ||
    new Set(saved.records.map((f) => f.pbp.id)).size !== 20
  )
    throw Error("Unexpected retained boundary fixture population");
  return saved.records;
}

export function retainedUnavailable2008Fixtures(): RetainedBoundaryFixture[] {
  const saved = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "./fixtures/reviewed-2008-unavailable-reports.json.gz",
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  ) as { version: string; records: RetainedBoundaryFixture[] };
  const expected = [2008020259, 2008020409, 2008020967, 2008021077];
  if (
    saved.version !== "retained-2008-unavailable-test-fixtures-v1" ||
    saved.records.length !== expected.length ||
    new Set(saved.records.map((r) => r.pbp.id)).size !== expected.length ||
    saved.records.some((r) => !expected.includes(r.pbp.id))
  )
    throw Error("Unexpected retained unavailable-source fixture population");
  return saved.records;
}

const clock = (n: number) =>
  `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
export function boundaryShiftFixture() {
  const ids = [8458229, 8469508, 8470655, 8468478, 8471392],
    names = ["Tkachuk", "McClement", "Backes", "Weaver", "Polak"];
  const rosterSpots = ids.map((playerId, i) => ({
    playerId,
    teamId: 2,
    sweaterNumber: i + 1,
    positionCode: "C",
    lastName: { default: names[i]! },
  }));
  const row = (
    n: number,
    p: number,
    start: number,
    end: number,
    duration = end - start,
    endPeriod = p,
  ) =>
    `<tr><td>${n}</td><td>${p}</td><td>${clock(start)} / ${clock(1200 - start)}</td><td>${clock(end)} / ${clock((endPeriod <= 3 ? 1200 : 300) - end)}</td><td>${clock(duration)}</td><td></td></tr>`;
  const summary = (values: number[]) =>
    "<tr><td>Per</td><td>SHF</td><td>AVG</td><td>TOI</td><td>EV TOT</td><td>PP TOT</td><td>SH TOT</td></tr>" +
    values
      .map(
        (v, i) =>
          `<tr><td>${i + 1}</td><td>1</td><td>${clock(v)}</td><td>${clock(v)}</td><td>${clock(v)}</td><td>0:00</td><td>0:00</td></tr>`,
      )
      .join("") +
    `<tr><td>TOT</td><td>3</td><td>1:00</td><td>${clock(values.reduce((a, b) => a + b, 0))}</td><td>${clock(values.reduce((a, b) => a + b, 0))}</td><td>0:00</td><td>0:00</td></tr>`;
  const header = (home: boolean) =>
    `<title>Time On Ice Report ${home ? "Home" : "Away"} Team</title><table><tr><td>Game 157</td><td>Wednesday, October 28, 2009</td></tr>`;
  let away = header(false);
  for (const [i, id] of ids.entries()) {
    const end = id === 8469508 ? 51 : 0;
    away +=
      `<tr><td class="playerHeading">${i + 1} ${names[i]!.toUpperCase()}, PLAYER</td></tr>` +
      row(1, 1, 0, 60) +
      row(2, 1, 1193, end, end ? 2625 : 2574, 2) +
      row(3, 2, 60, 120) +
      row(4, 3, 0, 60) +
      summary([67, 60 + end, 60]);
  }
  rosterSpots.push(
    {
      playerId: 8462152,
      teamId: 2,
      sweaterNumber: 30,
      positionCode: "G",
      lastName: { default: "Mason" },
    },
    {
      playerId: 900,
      teamId: 1,
      sweaterNumber: 31,
      positionCode: "G",
      lastName: { default: "Home" },
    },
  );
  away +=
    '<tr><td class="playerHeading">30 MASON, CHRIS</td></tr>' +
    row(1, 1, 0, 1200) +
    row(2, 3, 0, 1200) +
    summary([1200, 1200, 1200]) +
    "</table>";
  const home =
    header(true) +
    '<tr><td class="playerHeading">31 HOME, GOALIE</td></tr>' +
    row(1, 1, 0, 1200) +
    row(2, 2, 0, 1200) +
    row(3, 3, 0, 1200) +
    summary([1200, 1200, 1200]) +
    "</table>";
  const pbp = {
    id: 2009020157,
    gameDate: "2009-10-28",
    homeTeam: { id: 1 },
    awayTeam: { id: 2 },
    rosterSpots,
    plays: [
      {
        eventId: 1,
        typeDescKey: "shot-on-goal",
        periodDescriptor: { number: 2, periodType: "REG" },
        timeInPeriod: "10:00",
        details: { goalieInNetId: 8462152 },
      },
    ],
  };
  const box = {
    id: pbp.id,
    gameDate: pbp.gameDate,
    playerByGameStats: {
      homeTeam: {
        forwards: [],
        defense: [],
        goalies: [
          { playerId: 900, toi: "60:00", shotsAgainst: 0, goalsAgainst: 0 },
        ],
      },
      awayTeam: {
        forwards: ids.map((playerId) => ({
          playerId,
          toi: clock(187 + (playerId === 8469508 ? 51 : 0)),
        })),
        defense: [],
        goalies: [
          { playerId: 8462152, toi: "60:00", shotsAgainst: 1, goalsAgainst: 0 },
        ],
      },
    },
  };
  return { pbp, box, reports: { home, away }, apiShifts: [] as unknown[] };
}
export function twoBoundaryRowsFixture() {
  const source = boundaryShiftFixture();
  const values = [
    [8469760, "Michalek", [[1, 1180, 81, 2668]]],
    [
      8471691,
      "Hanzal",
      [
        [1, 1180, 81, 2668],
        [2, 1167, 52, 2652],
      ],
    ],
    [8471232, "Korpikoski", [[1, 1180, 81, 2668]]],
    [8460492, "Jovanovski", [[1, 1180, 81, 2668]]],
    [8468085, "Vrbata", [[2, 1167, 37, 2637]]],
    [8471279, "Lepisto", [[2, 1167, 0, 2600]]],
    [8459053, "Aucoin", [[2, 1167, 0, 2600]]],
  ] as const;
  const reportHeader =
    "<title>Time On Ice Report Away Team</title><table><tr><td>Game 1141</td><td>Tuesday, March 30, 2010</td></tr>";
  let away = reportHeader;
  const totals: Array<{ playerId: number; toi: string }> = [];
  source.pbp.rosterSpots = source.pbp.rosterSpots.filter(
    (p) => p.positionCode === "G",
  );
  for (const [i, [id, name, rows]] of values.entries()) {
    source.pbp.rosterSpots.push({
      playerId: id,
      teamId: 2,
      sweaterNumber: i + 1,
      positionCode: "C",
      lastName: { default: name },
    });
    away += `<tr><td class="playerHeading">${i + 1} ${name.toUpperCase()}, PLAYER</td></tr>`;
    let n = 1;
    const seconds = [100, 100, 100];
    for (let p = 1; p <= 3; p++)
      away += `<tr><td>${n++}</td><td>${p}</td><td>5:00 / 15:00</td><td>6:40 / 13:20</td><td>1:40</td><td></td></tr>`;
    for (const [p, start, end, duration] of rows) {
      seconds[p - 1]! += 1200 - start;
      seconds[p]! += end;
      away += `<tr><td>${n++}</td><td>${p}</td><td>${clock(start)} / ${clock(1200 - start)}</td><td>${clock(end)} / ${clock(1200 - end)}</td><td>${clock(duration)}</td><td></td></tr>`;
    }
    const total = seconds.reduce((a, b) => a + b, 0);
    totals.push({ playerId: id, toi: clock(total) });
    away +=
      "<tr><td>Per</td><td>SHF</td><td>AVG</td><td>TOI</td><td>EV TOT</td><td>PP TOT</td><td>SH TOT</td></tr>";
    for (const [index, t] of seconds.entries())
      away += `<tr><td>${index + 1}</td><td>1</td><td>1:00</td><td>${clock(t)}</td><td>${clock(t)}</td><td>0:00</td><td>0:00</td></tr>`;
    away += `<tr><td>TOT</td><td>3</td><td>1:00</td><td>${clock(total)}</td><td>${clock(total)}</td><td>0:00</td><td>0:00</td></tr>`;
  }
  const oldGoalie = source.reports.away.slice(
    source.reports.away.indexOf('<tr><td class="playerHeading">30 MASON'),
  );
  source.reports.away = away + oldGoalie;
  source.reports.home = source.reports.home
    .replace("Game 157", "Game 1141")
    .replace("Wednesday, October 28, 2009", "Tuesday, March 30, 2010");
  source.box.playerByGameStats.awayTeam.forwards = totals;
  source.pbp.id = source.box.id = 2009021141;
  source.pbp.gameDate = source.box.gameDate = "2010-03-30";
  return source;
}

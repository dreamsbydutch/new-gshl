import type { Shot } from "./game-value-input";

export function gameFixture() {
  const id = 2024020999;
  const player = (playerId: number, position: string) => ({
    playerId,
    position,
    name: { default: `Player ${playerId}` },
    toi: "20:00",
    shotsAgainst: position === "G" ? (playerId === 16 ? 2 : 0) : undefined,
    goalsAgainst: position === "G" ? (playerId === 16 ? 1 : 0) : undefined,
  });
  const home = [1, 2, 3, 4, 5, 6],
    away = [11, 12, 13, 14, 15, 16];
  const play = (
    eventId: number,
    timeInPeriod: string,
    typeDescKey: string,
    details: Record<string, unknown>,
  ) => ({
    eventId,
    timeInPeriod,
    typeDescKey,
    sortOrder: eventId,
    periodDescriptor: { number: 1, periodType: "REG" },
    situationCode: "1551",
    homeTeamDefendingSide: "left",
    details,
  });
  const pbp = {
    id,
    gameDate: "2025-01-01",
    homeTeam: { id: 1 },
    awayTeam: { id: 2 },
    plays: [
      play(1, "00:00", "faceoff", { eventOwnerTeamId: 1, zoneCode: "N" }),
      play(2, "00:10", "shot-on-goal", {
        eventOwnerTeamId: 1,
        shootingPlayerId: 1,
        goalieInNetId: 16,
        xCoord: 70,
        yCoord: 0,
        shotType: "wrist",
        zoneCode: "O",
      }),
      play(3, "00:20", "penalty", {
        eventOwnerTeamId: 1,
        committedByPlayerId: 2,
        typeCode: "MIS",
        duration: 10,
      }),
      play(4, "00:30", "penalty", {
        eventOwnerTeamId: 1,
        committedByPlayerId: 2,
        drawnByPlayerId: 11,
        typeCode: "MIN",
        duration: 2,
      }),
      play(5, "00:30", "penalty", {
        eventOwnerTeamId: 2,
        committedByPlayerId: 11,
        drawnByPlayerId: 2,
        typeCode: "MIN",
        duration: 2,
      }),
      play(6, "00:40", "goal", {
        eventOwnerTeamId: 1,
        scoringPlayerId: 1,
        goalieInNetId: 16,
        xCoord: 80,
        yCoord: 0,
        shotType: "wrist",
        zoneCode: "O",
      }),
      play(7, "20:00", "period-end", {}),
    ],
  };
  const team = (ids: number[]) => ({
    forwards: ids.slice(0, 3).map((id) => player(id, "C")),
    defense: ids.slice(3, 5).map((id) => player(id, "D")),
    goalies: [player(ids[5]!, "G")],
  });
  const box = {
    id,
    gameDate: pbp.gameDate,
    playerByGameStats: { homeTeam: team(home), awayTeam: team(away) },
  };
  const shifts = [...home, ...away].map((playerId) => ({
    playerId,
    gameId: id,
    teamId: playerId < 10 ? 1 : 2,
    period: 1,
    startTime: "00:00",
    endTime: "20:00",
    typeCode: 517,
  }));
  const shots: Shot[] = [
    {
      gameId: id,
      period: 1,
      second: 10,
      kind: "SHOT",
      home: true,
      shooter: 99,
      goalie: 16,
      xg: 0.1,
    },
    {
      gameId: id,
      period: 1,
      second: 40,
      kind: "GOAL",
      home: true,
      shooter: 1,
      goalie: 16,
      xg: 0.3,
    },
  ];
  return { sources: { pbp, box, shifts }, shots };
}

export function penaltyShotFixture() {
  const f = gameFixture();
  f.sources.pbp.plays = f.sources.pbp.plays.filter((p) =>
    [1, 3, 6, 7].includes(p.eventId),
  );
  const award = f.sources.pbp.plays.find((p) => p.eventId === 3)!;
  award.timeInPeriod = "00:40";
  award.details = {
    eventOwnerTeamId: 2,
    typeCode: "PS",
    duration: 0,
    committedByPlayerId: 11,
    drawnByPlayerId: 2,
  };
  f.sources.pbp.plays.find((p) => p.eventId === 6)!.situationCode = "1010";
  f.shots = [f.shots[1]!];
  f.sources.box.playerByGameStats.awayTeam.goalies[0]!.shotsAgainst = 1;
  return f;
}

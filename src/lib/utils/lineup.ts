import type { Player } from "@gshl-types";
import { PositionGroup, RosterPosition } from "@gshl-types";

export interface LineupAssignment {
  playerId: string;
  lineupPos: RosterPosition;
}

type PlayerPredicate = (player: Player) => boolean;

const IR_POSITIONS = new Set<RosterPosition>([
  RosterPosition.IR,
  RosterPosition.IRPlus,
]);

const FORWARD_CODES = new Set<string>(["LW", "C", "RW"]);
const DEFENSE_CODES = new Set<string>(["D"]);
const GOALIE_CODES = new Set<string>(["G"]);

function parseRosterPosition(value: unknown): RosterPosition | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return Object.values(RosterPosition).includes(candidate as RosterPosition)
    ? (candidate as RosterPosition)
    : null;
}

function getPositionCodes(player: Player): string[] {
  const raw = player.nhlPos as unknown;
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => String(entry).trim().toUpperCase())
      .filter((entry) => entry.length > 0);
  }
  if (typeof raw === "string" && raw.trim().length > 0) {
    return [raw.trim().toUpperCase()];
  }
  return [];
}

function getLineupScore(player: Player): number {
  if (
    typeof player.seasonRating === "number" &&
    !Number.isNaN(player.seasonRating)
  ) {
    return player.seasonRating;
  }
  if (
    typeof player.overallRating === "number" &&
    !Number.isNaN(player.overallRating)
  ) {
    return player.overallRating;
  }
  if (
    typeof player.preDraftRk === "number" &&
    !Number.isNaN(player.preDraftRk)
  ) {
    return 1000 - player.preDraftRk;
  }
  if (typeof player.seasonRk === "number" && !Number.isNaN(player.seasonRk)) {
    return 1000 - player.seasonRk;
  }
  if (typeof player.overallRk === "number" && !Number.isNaN(player.overallRk)) {
    return 1000 - player.overallRk;
  }
  return 0;
}

function isForward(player: Player): boolean {
  if (player.posGroup === PositionGroup.F) return true;
  return getPositionCodes(player).some((code) => FORWARD_CODES.has(code));
}

function isDefense(player: Player): boolean {
  if (player.posGroup === PositionGroup.D) return true;
  return getPositionCodes(player).some((code) => DEFENSE_CODES.has(code));
}

function isGoalie(player: Player): boolean {
  if (player.posGroup === PositionGroup.G) return true;
  return getPositionCodes(player).some((code) => GOALIE_CODES.has(code));
}

function playsPosition(player: Player, positionCode: string): boolean {
  return getPositionCodes(player).includes(positionCode.toUpperCase());
}

function selectPlayer(
  available: Player[],
  primary: PlayerPredicate,
  fallback?: PlayerPredicate,
): Player | null {
  let index = available.findIndex(primary);
  if (index === -1 && fallback) {
    index = available.findIndex(fallback);
  }
  if (index === -1) {
    return null;
  }
  const [selected] = available.splice(index, 1);
  return selected ?? null;
}

const isLockedPosition = (position: RosterPosition | null): boolean => {
  return position != null && IR_POSITIONS.has(position);
};

const isPlayerActive = (player: Player): boolean => {
  return player.isActive !== false;
};

export function generateLineupAssignments(
  players: Player[] | undefined | null,
): LineupAssignment[] {
  if (!players?.length) {
    return [];
  }

  const existingPositions = new Map<string, RosterPosition | null>();
  const assignmentMap = new Map<string, RosterPosition>();

  players.forEach((player) => {
    const currentPosition = parseRosterPosition(player.lineupPos);
    existingPositions.set(player.id, currentPosition);

    if (isLockedPosition(currentPosition)) {
      assignmentMap.set(player.id, currentPosition!);
    } else {
      assignmentMap.set(player.id, RosterPosition.BN);
    }
  });

  const availablePlayers = players
    .filter((player) => {
      if (!isPlayerActive(player)) return false;
      const currentPosition = parseRosterPosition(player.lineupPos);
      return !isLockedPosition(currentPosition);
    })
    .slice()
    .sort((a, b) => getLineupScore(b) - getLineupScore(a));

  const goalie = selectPlayer(availablePlayers, isGoalie);
  if (goalie) {
    assignmentMap.set(goalie.id, RosterPosition.G);
  }

  const forwardSlots: Array<{
    position: RosterPosition;
    preferredCode: string;
  }> = [
    { position: RosterPosition.LW, preferredCode: "LW" },
    { position: RosterPosition.C, preferredCode: "C" },
    { position: RosterPosition.RW, preferredCode: "RW" },
    { position: RosterPosition.LW, preferredCode: "LW" },
    { position: RosterPosition.C, preferredCode: "C" },
    { position: RosterPosition.RW, preferredCode: "RW" },
  ];

  forwardSlots.forEach(({ position, preferredCode }) => {
    const selected = selectPlayer(
      availablePlayers,
      (player) => playsPosition(player, preferredCode) && isForward(player),
      (player) => isForward(player) && !isGoalie(player),
    );
    if (selected) {
      assignmentMap.set(selected.id, position);
    }
  });

  const defenseSlots = 3;
  for (let index = 0; index < defenseSlots; index += 1) {
    const selected = selectPlayer(
      availablePlayers,
      isDefense,
      (player) => !isGoalie(player),
    );
    if (selected) {
      assignmentMap.set(selected.id, RosterPosition.D);
    }
  }

  const util = selectPlayer(
    availablePlayers,
    (player) => isForward(player) && !isGoalie(player),
    (player) => isDefense(player) && !isGoalie(player),
  );
  if (util) {
    assignmentMap.set(util.id, RosterPosition.Util);
  }

  const updates: LineupAssignment[] = [];
  players.forEach((player) => {
    const nextPosition = assignmentMap.get(player.id);
    if (!nextPosition) {
      return;
    }
    const previousPosition = existingPositions.get(player.id);
    if (previousPosition === nextPosition) {
      return;
    }
    updates.push({ playerId: player.id, lineupPos: nextPosition });
  });

  return updates;
}

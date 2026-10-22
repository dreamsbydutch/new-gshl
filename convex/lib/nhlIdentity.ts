export type OfficialNhlIdentity = {
  nhlPlayerId: number;
  firstName: string;
  lastName: string;
  birthDate: string;
  position: string;
  sourceUrl: string;
  sourceFetchedAt: number;
  sourceSha256: string;
};
export type NhlIdentityPerson = {
  _id: string;
  nhlApiId?: string | null;
  fullName: string;
  birthday?: unknown;
  posGroup?: unknown;
};
export function normalizedNhlIdentityName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
function birthDay(value: unknown, now: number): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const t = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(t) &&
      new Date(t).toISOString().slice(0, 10) === value
      ? value
      : null;
  }
  const t =
    typeof value === "number"
      ? value
      : /^\d+$/.test(value)
        ? Number(value)
        : Date.parse(value);
  return Number.isFinite(t) && t >= -2208988800000 && t <= now
    ? new Date(t).toISOString().slice(0, 10)
    : null;
}
/** The same strict identity checks serve single debutants and bounded historical batches. */
export function planOfficialNhlIdentity(
  bio: OfficialNhlIdentity,
  players: readonly NhlIdentityPerson[],
  historical = false,
  now = Date.now(),
) {
  if (
    Object.keys(bio).some(
      (k) =>
        ![
          "nhlPlayerId",
          "firstName",
          "lastName",
          "birthDate",
          "position",
          "sourceUrl",
          "sourceFetchedAt",
          "sourceSha256",
        ].includes(k),
    ) ||
    !Number.isSafeInteger(bio.nhlPlayerId) ||
    bio.nhlPlayerId <= 0 ||
    bio.sourceUrl !==
      `https://api-web.nhle.com/v1/player/${bio.nhlPlayerId}/landing` ||
    !Number.isSafeInteger(bio.sourceFetchedAt) ||
    bio.sourceFetchedAt <= 0 ||
    bio.sourceFetchedAt > now + 300000 ||
    !/^[a-f0-9]{64}$/.test(bio.sourceSha256)
  )
    throw Error("Invalid official NHL identity provenance");
  for (const name of [bio.firstName, bio.lastName])
    if (
      !name.trim() ||
      name !== name.trim() ||
      name.length > 100 ||
      /[\u0000-\u001f\u007f]/.test(name) ||
      !normalizedNhlIdentityName(name)
    )
      throw Error("Invalid official NHL player name");
  const date = birthDay(bio.birthDate, now),
    birth = Date.parse(`${bio.birthDate}T00:00:00.000Z`),
    age = (now - birth) / (365.2425 * 86400000);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(bio.birthDate) ||
    date !== bio.birthDate ||
    !Number.isFinite(age) ||
    age < 15 ||
    age > 100
  )
    throw Error("Invalid official NHL birth date");
  if (!["C", "L", "R", "LW", "RW", "D", "G"].includes(bio.position))
    throw Error("Invalid official NHL role");
  const token = String(bio.nhlPlayerId),
    assigned = players.filter((p) => p.nhlApiId === token);
  if (assigned.length > 1)
    throw Error("Ambiguous assigned NHL player identity");
  if (assigned[0])
    return { action: "existing" as const, playerId: assigned[0]._id, token };
  const fullName = `${bio.firstName} ${bio.lastName}`,
    names = players.filter(
      (p) =>
        normalizedNhlIdentityName(p.fullName) ===
        normalizedNhlIdentityName(fullName),
    );
  if (names.length > 1)
    throw Error(
      "Ambiguous normalized NHL player name requires identity review",
    );
  const posGroup =
      bio.position === "G" ? "G" : bio.position === "D" ? "D" : "F",
    candidate = names[0];
  if (candidate) {
    if (
      (candidate.nhlApiId !== undefined &&
        candidate.nhlApiId !== null &&
        candidate.nhlApiId !== "") ||
      birthDay(candidate.birthday, now) !== date ||
      candidate.posGroup !== posGroup
    )
      throw Error(
        "Existing name requires independent exact birth date and role identity review",
      );
    return {
      action: "link" as const,
      playerId: candidate._id,
      token,
      previousNhlApiId: candidate.nhlApiId ?? null,
    };
  }
  return {
    action: "create" as const,
    playerId: null,
    token,
    document: {
      nhlApiId: token,
      firstName: bio.firstName,
      lastName: bio.lastName,
      fullName,
      birthday: birth,
      posGroup,
      nhlPos: [
        bio.position === "L"
          ? "LW"
          : bio.position === "R"
            ? "RW"
            : bio.position,
      ],
      isActive: !historical,
      isSignable: false,
      isResignable: false,
    },
  };
}

/** Validate the whole batch against its own prospective identities before any mutation. */
export function planHistoricalNhlIdentityBatch(
  officials: readonly OfficialNhlIdentity[],
  players: readonly NhlIdentityPerson[],
) {
  if (
    !officials.length ||
    officials.length > 100 ||
    new Set(officials.map((b) => b.nhlPlayerId)).size !== officials.length
  )
    throw Error("Historical identities require 1–100 unique NHL IDs");
  const virtual = players.map((p) => ({ ...p }));
  return officials.map((bio, index) => {
    const plan = planOfficialNhlIdentity(bio, virtual, true);
    if (plan.action === "create")
      virtual.push({ _id: `pending:${index}`, ...plan.document });
    else if (plan.action === "link")
      virtual.find((p) => p._id === plan.playerId)!.nhlApiId = plan.token;
    return { nhlPlayerId: bio.nhlPlayerId, ...plan };
  });
}

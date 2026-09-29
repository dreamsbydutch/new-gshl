import type { NhlContractInput } from "../../../../convex/lib/nhlContractFields";
import { toUtcTimestamp } from "../../../../convex/lib/timestamps";
import { canonicalName, type DirectoryPlayer } from "./player-directory";
import {
  moneyValue,
  seasonStartYear,
  type StoredSalaryPlayer,
} from "./nhl-salaries";

export type NhlContractObservation = Omit<NhlContractInput, "playerId"> & {
  playerId: string;
};
export type ContractCandidate = Omit<NhlContractObservation, "playerId"> & {
  fullName: string;
  birthDate: string;
  nhlApiId?: string;
};
export type ContractAudit = {
  rows: ContractCandidate[];
  blankRows: number;
  duplicateRows: number;
  errors: string[];
  warnings: string[];
};

export type ContractPlayerMapping = {
  sourceName: string;
  sourceBirthDate: string;
  playerId: string;
  reason: string;
  sourceRef: string;
  allowBirthdateConflict?: boolean;
};

export function parseNhlContractPlayerMappings(
  input: unknown,
): ContractPlayerMapping[] {
  if (!Array.isArray(input))
    throw new Error("Player mappings must be a JSON array");
  const seen = new Set<string>();
  return input.map((value: unknown) => {
    if (!value || typeof value !== "object")
      throw new Error("Invalid player mapping");
    const row = value as Record<string, unknown>;
    for (const key of [
      "sourceName",
      "sourceBirthDate",
      "playerId",
      "reason",
      "sourceRef",
    ]) {
      if (typeof row[key] !== "string" || !row[key].trim())
        throw new Error(`Player mapping requires ${key}`);
    }
    if (
      signingTimestamp(row.sourceBirthDate) === null ||
      (row.allowBirthdateConflict !== undefined &&
        typeof row.allowBirthdateConflict !== "boolean")
    )
      throw new Error("Invalid player mapping birthdate or conflict flag");
    const mapping = row as ContractPlayerMapping;
    const key = JSON.stringify([
      canonicalName(mapping.sourceName),
      mapping.sourceBirthDate,
    ]);
    if (seen.has(key))
      throw new Error("Duplicate source identity in player mappings");
    seen.add(key);
    return mapping;
  });
}

function dateKey(value: unknown): string {
  const time = toUtcTimestamp(value);
  return time === null ? "" : new Date(time).toISOString().slice(0, 10);
}

function signingTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const time = toUtcTimestamp(value);
  return time !== null && dateKey(time) === value ? time : null;
}

export function contractIdentity(
  row: Pick<
    NhlContractObservation,
    "playerId" | "startSeasonStartYear" | "signingDate"
  >,
): string {
  return JSON.stringify([
    row.playerId,
    row.startSeasonStartYear,
    row.signingDate,
  ]);
}

export function parseNhlContractHistory(
  input: unknown,
  sourceRef: string,
): ContractAudit {
  if (!Array.isArray(input))
    throw new Error("NHL contract history must be a JSON array");
  const audit: ContractAudit = {
    rows: [],
    blankRows: 0,
    duplicateRows: 0,
    errors: [],
    warnings: [],
  };
  const seen = new Map<string, ContractCandidate>();
  const ids = new Map<string, string>();
  for (const [index, value] of input.entries()) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      audit.errors.push(`Row ${index + 1}: expected an object`);
      continue;
    }
    const raw = value as Record<string, unknown>;
    const text = (key: string) =>
      typeof raw[key] === "string"
        ? raw[key].trim()
        : typeof raw[key] === "number"
          ? String(raw[key])
          : "";
    const fullName = text("Name");
    if (
      !fullName &&
      !text("Cap Hit") &&
      !text("Signing Date") &&
      !text("ContractId")
    ) {
      audit.blankRows++;
      continue;
    }
    const label = `Row ${index + 1} (${fullName}, ${text("Season")})`;
    const seasonEndYear = /^\d{4}$/.test(text("Season"))
      ? seasonStartYear(text("Season"))
      : null;
    const start = seasonStartYear(text("Start Year"));
    const expiry = seasonStartYear(text("Expiry Year"));
    const signed = signingTimestamp(text("Signing Date"));
    const birth = signingTimestamp(text("Birthdate"));
    const capHit = moneyValue(text("Cap Hit"));
    const length = Number(text("Length"));
    if (
      !fullName ||
      seasonEndYear === null ||
      start === null ||
      expiry === null ||
      signed === null ||
      birth === null ||
      capHit === null ||
      !Number.isInteger(length) ||
      length < 1 ||
      length > 30 ||
      !text("ContractId")
    ) {
      audit.errors.push(
        `${label}: missing or invalid identity, date, term, season, or cap hit`,
      );
      continue;
    }
    const season = seasonEndYear - 1;
    const statusYear = /YR (\d+) OF/.exec(text("Status"))?.[1];
    if (
      expiry - start + 1 !== length ||
      season < start ||
      season > expiry ||
      (statusYear && Number(statusYear) !== season - start + 1)
    ) {
      audit.warnings.push(
        `${label}: source term/status disagrees with season; original values preserved`,
      );
    }
    const signingAge = Number(text("Signing Age"));
    const row: ContractCandidate = {
      fullName,
      birthDate: text("Birthdate"),
      signingDate: signed,
      startSeasonStartYear: start,
      expirySeasonStartYear: expiry,
      length,
      seasonStartYear: season,
      capHit,
      source: "historical-json",
      sourceRef,
      historicalContractId: text("ContractId"),
      historicalValues: Object.fromEntries(
        Object.entries(raw).map(([key, entry]) => [
          key,
          typeof entry === "string" || typeof entry === "number"
            ? String(entry)
            : "",
        ]),
      ),
      ...(text("Signing Age") && Number.isFinite(signingAge)
        ? { signingAge }
        : {}),
      ...(text("Signing Status")
        ? { signingStatus: text("Signing Status") }
        : {}),
      ...(text("Expiry Status") ? { expiryStatus: text("Expiry Status") } : {}),
      ...(text("Signing Agent") ? { signingAgent: text("Signing Agent") } : {}),
      ...(text("Signing GM") ? { signingGm: text("Signing GM") } : {}),
      clauses: text("Clauses"),
      status: text("Status"),
    };
    const identity = JSON.stringify([
      canonicalName(fullName),
      row.birthDate,
      start,
      signed,
    ]);
    const previousIdentity = ids.get(row.historicalContractId!);
    if (previousIdentity && previousIdentity !== identity)
      audit.errors.push(`${label}: ContractId identifies different contracts`);
    ids.set(row.historicalContractId!, identity);
    const key = JSON.stringify([identity, season]);
    const previous = seen.get(key);
    if (previous) {
      const withoutRaw = (candidate: ContractCandidate) => ({
        ...candidate,
        historicalValues: undefined,
      });
      if (
        JSON.stringify(withoutRaw(previous)) !== JSON.stringify(withoutRaw(row))
      )
        audit.errors.push(`${label}: conflicting duplicate contract season`);
      else audit.duplicateRows++;
      continue;
    }
    seen.set(key, row);
    audit.rows.push(row);
  }
  return audit;
}

export function puckPediaContractCandidates(
  players: readonly DirectoryPlayer[],
  season: number,
  sourceRef: string,
): ContractAudit {
  const audit: ContractAudit = {
    rows: [],
    blankRows: 0,
    duplicateRows: 0,
    errors: [],
    warnings: [],
  };
  for (const player of players) {
    const start = seasonStartYear(player.contractStartYear);
    const expiry = seasonStartYear(player.expiryYear);
    const signed = signingTimestamp(player.signingDate);
    if (
      start === null ||
      expiry === null ||
      signed === null ||
      !player.contractLength ||
      player.capHit === null
    ) {
      audit.warnings.push(
        `${player.fullName} (${season}): missing contract identity/term/cap hit; skipped`,
      );
      continue;
    }
    // Do not attach the current deal's figures to a future focus season if
    // the directory returns a player without a contract covering that season.
    if (season < start || season > expiry) {
      audit.warnings.push(
        `${player.fullName} (${season}): contract does not cover focus season; skipped`,
      );
      continue;
    }
    audit.rows.push({
      fullName: player.fullName,
      birthDate: player.birthDate,
      nhlApiId: player.nhlApiId,
      signingDate: signed,
      startSeasonStartYear: start,
      expirySeasonStartYear: expiry,
      length: player.contractLength,
      seasonStartYear: season,
      capHit: player.capHit,
      ...(player.salary !== null ? { cashSalary: player.salary } : {}),
      ...(player.signingStatus ? { signingStatus: player.signingStatus } : {}),
      ...(player.expiryStatus ? { expiryStatus: player.expiryStatus } : {}),
      ...(player.signingAgent ? { signingAgent: player.signingAgent } : {}),
      ...(player.signingGm ? { signingGm: player.signingGm } : {}),
      clauses: player.clauses,
      status: player.contractStatus,
      source: "puckpedia",
      sourceRef,
    });
  }
  return audit;
}

export function reconcileNhlContracts(
  candidates: readonly ContractCandidate[],
  players: readonly StoredSalaryPlayer[],
  mappings: readonly ContractPlayerMapping[] = [],
) {
  const rows: NhlContractObservation[] = [];
  const unresolved: Array<{ name: string; birthDate: string; reason: string }> =
    [];
  const seen = new Map<string, NhlContractObservation>();
  const byPlayerId = new Map(players.map((player) => [player.id, player]));
  const reviewed = new Map(
    mappings.map((mapping) => [
      JSON.stringify([
        canonicalName(mapping.sourceName),
        mapping.sourceBirthDate,
      ]),
      mapping,
    ]),
  );
  let mappedRows = 0;
  const byNhlId = new Map<string, StoredSalaryPlayer[]>();
  const byNameAndBirth = new Map<string, StoredSalaryPlayer[]>();
  for (const player of players) {
    if (player.nhlApiId) {
      const matches = byNhlId.get(player.nhlApiId) ?? [];
      matches.push(player);
      byNhlId.set(player.nhlApiId, matches);
    }
    const birthDate = dateKey(player.birthday);
    if (!birthDate) continue;
    const key = JSON.stringify([
      canonicalName(
        player.fullName || `${player.firstName ?? ""} ${player.lastName ?? ""}`,
      ),
      birthDate,
    ]);
    const matches = byNameAndBirth.get(key) ?? [];
    matches.push(player);
    byNameAndBirth.set(key, matches);
  }
  for (const candidate of candidates) {
    const mapping = reviewed.get(
      JSON.stringify([canonicalName(candidate.fullName), candidate.birthDate]),
    );
    const idMatches = candidate.nhlApiId
      ? (byNhlId.get(candidate.nhlApiId) ?? [])
      : [];
    const matches = mapping
      ? byPlayerId.has(mapping.playerId)
        ? [byPlayerId.get(mapping.playerId)!]
        : []
      : idMatches.length
        ? idMatches
        : (byNameAndBirth.get(
            JSON.stringify([
              canonicalName(candidate.fullName),
              candidate.birthDate,
            ]),
          ) ?? []);
    const player = matches.length === 1 ? matches[0] : undefined;
    if (
      !player ||
      (candidate.nhlApiId &&
        player.nhlApiId &&
        candidate.nhlApiId !== player.nhlApiId) ||
      (candidate.birthDate &&
        dateKey(player.birthday) &&
        dateKey(player.birthday) !== candidate.birthDate &&
        !mapping?.allowBirthdateConflict)
    ) {
      unresolved.push({
        name: candidate.fullName,
        birthDate: candidate.birthDate,
        reason:
          matches.length > 1
            ? "ambiguous player"
            : "missing player or conflicting birthdate",
      });
      continue;
    }
    const {
      fullName: _name,
      birthDate: _birth,
      nhlApiId: _nhlId,
      ...fields
    } = candidate;
    const row = {
      ...fields,
      playerId: player.id,
      ...(mapping
        ? {
            identityMatchNote: mapping.reason,
            identityMatchSource: mapping.sourceRef,
          }
        : {}),
    };
    if (mapping) mappedRows++;
    const key = JSON.stringify([contractIdentity(row), row.seasonStartYear]);
    const previous = seen.get(key);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(row))
        unresolved.push({
          name: candidate.fullName,
          birthDate: candidate.birthDate,
          reason: "conflicting observations for one contract season",
        });
      continue;
    }
    seen.set(key, row);
    rows.push(row);
  }
  return { rows, unresolved, mappedRows };
}

export function groupNhlContracts(
  rows: readonly NhlContractObservation[],
): NhlContractObservation[][] {
  const groups = new Map<string, NhlContractObservation[]>();
  for (const row of rows) {
    const key = contractIdentity(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}

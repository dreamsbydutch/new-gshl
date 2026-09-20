import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import type { Value } from "convex/values";
import type {
  Contract,
  GSHLTeam,
  Season,
  UseContractDataOptions,
  UseContractDataResult,
} from "@gshl-types";
import {
  ContractStatus,
  ContractType,
} from "../src/lib/utils/domain/constants";
import { useContractData } from "../src/hooks/features/useContractData";

const season: Season = {
  id: "season-1",
  year: 2027,
  name: "2026-27",
  categories: [],
  rosterSpots: [],
  startDate: "2026-10-01",
  endDate: "2027-04-20",
  signingEndDate: "2027-06-20",
  isActive: true,
  usesLegacyTies: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};
const team: GSHLTeam = {
  id: "team-1",
  seasonId: season.id,
  franchiseId: "franchise-1",
  name: null,
  abbr: null,
  logoUrl: null,
  isActive: true,
  yahooId: null,
  confId: null,
  confName: null,
  confAbbr: null,
  confLogoUrl: null,
  ownerId: "owner-1",
  ownerFirstName: null,
  ownerLastName: null,
  ownerNickname: null,
  ownerEmail: null,
  ownerOwing: null,
  ownerIsActive: true,
};
const contract: Contract = {
  id: "contract-1",
  playerId: "player-1",
  ownerId: "owner-1",
  seasonId: season.id,
  contractType: [ContractType.STANDARD],
  contractLength: 1,
  contractSalary: 1_000_000,
  signingDate: "2026-06-01",
  startDate: "2026-10-01",
  signingStatus: ContractStatus.DRAFTED,
  expiryStatus: ContractStatus.RFA,
  expiryDate: "2027-04-20",
  capHit: 1_000_000,
  capHitEndDate: "2027-04-20",
  createdAt: new Date(0),
  updatedAt: new Date(0),
};
const context: UseContractDataOptions = {
  currentSeason: season,
  currentTeam: team,
  seasons: [season],
};

// Render real hooks against cached query snapshots. No subscription effects or network run.
function renderContractData(
  options: UseContractDataOptions,
  responses: Record<string, unknown> = {},
) {
  const client = new ConvexReactClient("https://contract-test.convex.cloud");
  const queries = new Map<string, unknown>();
  const watch = mock.method(
    client,
    "watchQuery",
    (query: FunctionReference<"query">, args: Record<string, Value>) => {
      const name = getFunctionName(query);
      queries.set(name, args);
      return {
        localQueryResult: () => responses[name],
        localQueryLogs: () => undefined,
        journal: () => undefined,
        onUpdate: () => () => undefined,
      };
    },
  );
  let result: UseContractDataResult | undefined;
  function Probe() {
    result = useContractData(options);
    return null;
  }
  try {
    renderToStaticMarkup(
      createElement(ConvexProvider, { client }, createElement(Probe)),
    );
  } finally {
    watch.mock.restore();
    void client.close();
  }
  assert.ok(result);
  return { result, queries };
}

void test("missing owner or disabled input skips every contract-dependent query", () => {
  const cases: UseContractDataOptions[] = [{}, { ...context, enabled: false }];
  for (const options of cases) {
    const { result, queries } = renderContractData(options);
    assert.equal(queries.size, 0);
    assert.equal(result.isLoading, false);
    assert.equal(
      result.table.ready,
      Boolean(options.currentSeason && options.currentTeam),
    );
  }
});

void test("pending owner contracts do not start unscoped player or salary reads", () => {
  const { result, queries } = renderContractData(context);
  assert.deepEqual(
    [...queries],
    [
      [
        "frontend:contracts",
        {
          where: {
            ownerId: "owner-1",
            playerId: undefined,
            seasonId: undefined,
          },
        },
      ],
    ],
  );
  assert.equal(result.isLoading, true);
  assert.equal(result.table.ready, false);
});

void test("empty owner contracts are ready without player or salary reads", () => {
  const { result, queries } = renderContractData(context, {
    "frontend:contracts": [],
  });
  assert.equal(queries.size, 1);
  assert.equal(result.isLoading, false);
  assert.equal(result.table.ready, true);
  assert.deepEqual(result.currentContracts, []);
});

void test("owner override scopes contracts and excludes other owners from dependent reads", () => {
  const { result, queries } = renderContractData(
    { ...context, ownerId: "owner-2" },
    {
      "frontend:contracts": [contract],
    },
  );
  assert.deepEqual(queries.get("frontend:contracts"), {
    where: { ownerId: "owner-2", playerId: undefined, seasonId: undefined },
  });
  assert.equal(queries.size, 1);
  assert.deepEqual(result.currentContracts, []);
});

void test("table waits independently for related players and NHL salary history", () => {
  for (const pending of [
    "frontend:playersByIds",
    "frontend:playerNhlSalaryHistory",
  ]) {
    const responses = {
      "frontend:contracts": [contract, contract],
      "frontend:playersByIds": [],
      "frontend:playerNhlSalaryHistory": [],
      [pending]: undefined,
    };
    const { result, queries } = renderContractData(context, responses);
    assert.deepEqual(queries.get("frontend:playersByIds"), {
      ids: ["player-1"],
    });
    assert.deepEqual(queries.get("frontend:playerNhlSalaryHistory"), {
      playerIds: ["player-1"],
    });
    assert.equal(result.isLoading, true);
    assert.equal(result.table.ready, false);
    assert.equal(result.currentContracts.length, 1);
  }
});

void test("completed dependent reads expose projections even when player and salary records are missing", () => {
  const responses = {
    "frontend:contracts": [contract],
    "frontend:playersByIds": [],
    "frontend:playerNhlSalaryHistory": [],
  };
  const { result } = renderContractData(context, responses);
  assert.equal(result.isLoading, false);
  assert.equal(result.table.ready, true);
  assert.deepEqual(result.table.contractGroups, [[contract]]);
  assert.deepEqual(result.contractPlayers, []);
  assert.equal(result.error, null);
  assert.equal(
    renderContractData({ ...context, currentSeason: undefined }, responses)
      .result.table.ready,
    false,
  );
  assert.equal(
    renderContractData(
      { ...context, currentTeam: undefined, ownerId: "owner-1" },
      responses,
    ).result.table.ready,
    false,
  );
});

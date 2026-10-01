import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { HockeyDataCache } from "../../integrations/nhl/game-value-source";
import {
  parseOfficialAppearances,
  parseOfficialStatAppearances,
  parseProviderAppearances,
  reconcileGameLedger,
} from "../../domains/nhl/game-reconciliation";
import {
  buildNhlRatingInput,
  type NhlRatingSource,
} from "../../domains/nhl/season-rating-input";

export async function runGameReconciliation(
  input: string,
  cache: HockeyDataCache,
  output: string,
) {
  const summary = JSON.parse(
    await readFile(resolve(input, "summary.json"), "utf8"),
  ) as {
    seasons: Array<{
      nhlSeason: number;
      name: string;
      incomplete: Array<{ id: number; name: string }>;
    }>;
  };
  const records: Array<Record<string, unknown>> = [];
  for (const season of summary.seasons) {
    const source = JSON.parse(
      await readFile(
        resolve(input, String(season.nhlSeason), "source.json"),
        "utf8",
      ),
    ) as { nhl: NhlRatingSource };
    if (source.nhl.gameType !== 2 || source.nhl.season !== season.nhlSeason)
      throw new Error(
        "This reconciliation currently requires regular-season snapshots",
      );
    const players = new Map(
      buildNhlRatingInput(source.nhl).players.map((p) => [p.playerId, p]),
    );
    for (const target of season.incomplete) {
      try {
        const player = players.get(target.id);
        if (!player)
          throw new Error("Target absent from canonical NHL snapshot");
        const officialUrl = `https://api-web.nhle.com/v1/player/${target.id}/game-log/${season.nhlSeason}/2`;
        const providerUrl = `https://www.moneypuck.com/moneypuck/playerData/careers/gameByGame/regular/${player.position === "G" ? "goalies" : "skaters"}/${target.id}.csv`;
        let official;
        let officialRepair;
        try {
          official = parseOfficialAppearances(
            await cache.json<unknown>(officialUrl),
            season.nhlSeason,
          );
        } catch (error) {
          const params = new URLSearchParams({
            isAggregate: "false",
            isGame: "true",
            limit: "-1",
            cayenneExp: `playerId=${target.id} and seasonId=${season.nhlSeason} and gameTypeId=2`,
          });
          const url = `https://api.nhle.com/stats/rest/en/${player.position === "G" ? "goalie" : "skater"}/summary?${params}`;
          const fallback = parseOfficialStatAppearances(
            await cache.json<unknown>(url),
            target.id,
            season.nhlSeason,
            player.position === "G",
          );
          official = fallback.appearances;
          officialRepair = {
            url,
            reason: error instanceof Error ? error.message : String(error),
            nonAppearanceGameIds: fallback.nonAppearanceGameIds,
            confirmedZeroExposureGameIds: official
              .filter((p) => p.seconds === 0)
              .map((p) => p.gameId),
          };
        }
        const provider = parseProviderAppearances(
          (await cache.bytes(providerUrl)).toString("utf8"),
          target.id,
          season.nhlSeason,
        );
        if (
          official.length !== player.games ||
          Math.abs(
            official.reduce((s, p) => s + p.seconds, 0) / 60 - player.minutes,
          ) > Math.max(1, player.minutes * 0.005)
        )
          throw new Error(
            "Official game log does not reconcile with official season summary",
          );
        const ledger = reconcileGameLedger(official, provider);
        const confirmedExtra: number[] = [],
          conflictingExtra: number[] = [];
        for (const gameId of ledger.extra) {
          const box = await cache.json<{
            playerByGameStats: Record<
              string,
              Record<string, Array<{ playerId: number; toi: string }>>
            >;
          }>(`https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`);
          const present = Object.values(box.playerByGameStats)
            .flatMap((team) => Object.values(team).flat())
            .some((p) => p.playerId === target.id && p.toi !== "00:00");
          (present ? conflictingExtra : confirmedExtra).push(gameId);
        }
        const excluded = new Set(confirmedExtra);
        const correctedRows = provider.filter((g) => !excluded.has(g.gameId));
        const aggregate: Record<string, number> = {};
        for (const game of correctedRows)
          for (const row of game.rows) {
            // Explicit additive fields only; never sum percentages or per-game averages.
            for (const field of [
              "icetime",
              "OnIce_F_xGoals",
              "OnIce_A_xGoals",
              "I_F_xGoals",
              "I_F_goals",
              "xGoals",
              "goals",
              "ongoal",
            ]) {
              if (row[field]?.trim()) {
                const number = Number(row[field]);
                if (!Number.isFinite(number))
                  throw new Error("Malformed additive provider field");
                const key = `${row.situation}:${field}`;
                aggregate[key] = (aggregate[key] ?? 0) + number;
              }
            }
          }
        records.push({
          season: season.nhlSeason,
          playerId: target.id,
          name: target.name,
          officialUrl,
          providerUrl,
          officialRepair,
          status: conflictingExtra.length
            ? "conflicting official sources"
            : ledger.missing.length || ledger.toiConflicts.length
              ? "ledger repaired; advanced reconstruction required"
              : confirmedExtra.length
                ? "extra appearances removed from derived totals"
                : "no appearance discrepancy; inspect event definitions/exposure",
          ledger,
          confirmedExtra,
          conflictingExtra,
          correctedProviderGameIds: correctedRows.map((r) => r.gameId),
          correctedProviderTotals: aggregate,
          reconstructionGameIds: [
            ...new Set([
              ...ledger.missing,
              ...ledger.toiConflicts.map((p) => p.gameId),
            ]),
          ],
          completeAppearanceCoverage:
            !ledger.missing.length &&
            !ledger.toiConflicts.length &&
            !conflictingExtra.length,
          advancedDataValidated: false,
          advancedValidationNote:
            "Appearance and TOI reconciliation does not validate shot definitions or recover missing expected-goal events; use the game reconstruction audit.",
        });
      } catch (error) {
        records.push({
          season: season.nhlSeason,
          playerId: target.id,
          name: target.name,
          status: "unresolved",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (records.length % 10 === 0)
        console.log(`Reconciled ${records.length} flagged player-seasons`);
    }
  }
  const result = {
    version: "nhl-game-reconciliation-v1",
    createdAt: new Date().toISOString(),
    attribution:
      "Official NHL game logs and boxscores; MoneyPuck.com career game downloads",
    originalSourcesPreserved: true,
    records,
  };
  await writeFile(resolve(output), JSON.stringify(result, null, 2) + "\n", {
    flag: "wx",
  });
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      cache: { type: "string" },
      output: { type: "string" },
      offline: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help)
    console.log(
      "Reconcile every incomplete v2 player-season against official game logs. --input <v2 root> --cache <public cache> --output <NEW ledger.json> [--offline]. Extra appearances require boxscore confirmation. Corrected derived totals remain explicitly partial when games are missing. No production writes.",
    );
  else {
    if (!values.input || !values.cache || !values.output)
      throw new Error("--input, --cache and --output required");
    await runGameReconciliation(
      values.input,
      new HockeyDataCache(values.cache, values.offline),
      values.output,
    );
  }
}

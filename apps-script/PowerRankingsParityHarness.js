// @ts-nocheck

function runPowerRankingsParitySample(request) {
  return PowerRankingsParityHarness.runSample(request || {});
}

var PowerRankingsParityHarness = (function PowerRankingsParityHarnessModule() {
  "use strict";

  var ns = {};

  function requireSeasonId(seasonId) {
    var seasonKey =
      seasonId === undefined || seasonId === null ? "" : String(seasonId).trim();
    if (!seasonKey) {
      throw new Error("[PowerRankingsParityHarness] seasonId is required");
    }
    return seasonKey;
  }

  function toIdSet(values) {
    var set = new Set();
    (values || []).forEach(function (value) {
      if (value === undefined || value === null || value === "") return;
      set.add(String(value));
    });
    return set;
  }

  ns.runSample = function runSample(request) {
    var seasonKey = requireSeasonId(request && request.seasonId);
    var result = PowerRankingsAlgo.updatePowerRankingsForSeason(seasonKey, {
      weekTypes: request && request.weekTypes ? request.weekTypes : null,
      seasonType: request && request.seasonType ? request.seasonType : null,
      dryRun: true,
      returnRows: true,
      logToConsole: false,
    });

    var weekKeySet = toIdSet(request && request.weekKeys);
    var matchupIdSet = toIdSet(request && request.matchupIds);
    var seasonTypeSet = toIdSet(request && request.seasonTypes);

    var weekUpdates = (result && result.weekUpdates ? result.weekUpdates : []).filter(
      function (row) {
        if (!weekKeySet.size) return true;
        return weekKeySet.has(
          String(row && row.gshlTeamId) + "::" + String(row && row.weekId),
        );
      },
    );
    var seasonUpdates = (
      result && result.seasonUpdates ? result.seasonUpdates : []
    ).filter(function (row) {
      if (!seasonTypeSet.size) return true;
      return seasonTypeSet.has(String(row && row.seasonType));
    });
    var matchupUpdates = (
      result && result.matchupUpdates ? result.matchupUpdates : []
    ).filter(function (row) {
      if (!matchupIdSet.size) return true;
      return matchupIdSet.has(String(row && row.id));
    });

    return {
      seasonId: seasonKey,
      updatedWeekRows: result && result.updatedWeekRows ? result.updatedWeekRows : 0,
      updatedSeasonRows:
        result && result.updatedSeasonRows ? result.updatedSeasonRows : 0,
      updatedMatchupRows:
        result && result.updatedMatchupRows ? result.updatedMatchupRows : 0,
      weekUpdates: weekUpdates,
      seasonUpdates: seasonUpdates,
      matchupUpdates: matchupUpdates,
    };
  };

  return ns;
})();

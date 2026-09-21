// @ts-nocheck

var RankingEngine = RankingEngine || {};

(function (ns) {
  "use strict";

  var api = {};
  var initialized = false;

  var PositionGroup;
  var GOALIE_MINIMUM_TOI_FOR_RATING;
  var GOALIE_NEGLIGIBLE_TOI_THRESHOLD;
  var GOALIE_NEGLIGIBLE_TOI_MAX_SCORE;
  var clip;
  var toNumber;
  var normalizeModelName;
  var normalizePosGroup;
  var hasMeaningfulPlayerVolume;
  var sortedValues;
  var sortedValuesByGetter;
  var maxSortedValue;
  var minSortedValue;
  var getRetainedRangeFloorValue;
  var getAggregateDistributionLimit;
  var getAggregateSeasonTypeKey;
  var getAggregateCategoryScoreMode;
  var getRetainedRangeShare;
  var getDayWeekBaselineRows;
  var limitDistribution;
  var getComparableCategoryValue;
  var isLowerBetterStat;
  var getUsageRateValue;
  var getComparableUsageValue;
  var getUsageValue;
  var getComparableSkaterEventLoadValue;
  var getSkaterEventLoadValue;
  var computeAggregateCategoryScore;
  var clampCategoryScore;
  var weightedAverage;
  var computeSupportScore;
  var computeBreadthScore;
  var computeWeightedScoreAverage;
  var computeWeightedTopAverage;
  var getNhlBreadthEntries;
  var computePlayerNhlCoreScore;
  var getRatingSkaterCategories;
  var getSkaterProfile;
  var getGoalieProfile;
  var getSkaterCategoryWeights;
  var applySkaterTalentCategoryEmphasis;
  var computePlayerNhlSeasonValueScore;
  var average;
  var roundScore;
  var getScoreScale;
  var applyAggregateModelCalibration;
  var finalizeAggregateScore;
  var getGoalieToiValue;

  function ensureDeps() {
    if (initialized) return;

    var deps = ns.EngineDeps || {};
    PositionGroup = deps.PositionGroup;
    GOALIE_MINIMUM_TOI_FOR_RATING = deps.GOALIE_MINIMUM_TOI_FOR_RATING;
    GOALIE_NEGLIGIBLE_TOI_THRESHOLD = deps.GOALIE_NEGLIGIBLE_TOI_THRESHOLD;
    GOALIE_NEGLIGIBLE_TOI_MAX_SCORE = deps.GOALIE_NEGLIGIBLE_TOI_MAX_SCORE;
    clip = deps.clip;
    toNumber = deps.toNumber;
    normalizeModelName = deps.normalizeModelName;
    normalizePosGroup = deps.normalizePosGroup;
    hasMeaningfulPlayerVolume = deps.hasMeaningfulPlayerVolume;
    sortedValues = deps.sortedValues;
    sortedValuesByGetter = deps.sortedValuesByGetter;
    maxSortedValue = deps.maxSortedValue;
    minSortedValue = deps.minSortedValue;
    getRetainedRangeFloorValue = deps.getRetainedRangeFloorValue;
    getAggregateDistributionLimit = deps.getAggregateDistributionLimit;
    getAggregateSeasonTypeKey = deps.getAggregateSeasonTypeKey;
    getAggregateCategoryScoreMode = deps.getAggregateCategoryScoreMode;
    getRetainedRangeShare = deps.getRetainedRangeShare;
    getDayWeekBaselineRows = deps.getDayWeekBaselineRows;
    limitDistribution = deps.limitDistribution;
    getComparableCategoryValue = deps.getComparableCategoryValue;
    isLowerBetterStat = deps.isLowerBetterStat;
    getUsageRateValue = deps.getUsageRateValue;
    getComparableUsageValue = deps.getComparableUsageValue;
    getUsageValue = deps.getUsageValue;
    getComparableSkaterEventLoadValue = deps.getComparableSkaterEventLoadValue;
    getSkaterEventLoadValue = deps.getSkaterEventLoadValue;
    computeAggregateCategoryScore = deps.computeAggregateCategoryScore;
    clampCategoryScore = deps.clampCategoryScore;
    weightedAverage = deps.weightedAverage;
    computeSupportScore = deps.computeSupportScore;
    computeBreadthScore = deps.computeBreadthScore;
    computeWeightedScoreAverage = deps.computeWeightedScoreAverage;
    computeWeightedTopAverage = deps.computeWeightedTopAverage;
    getNhlBreadthEntries = deps.getNhlBreadthEntries;
    computePlayerNhlCoreScore = deps.computePlayerNhlCoreScore;
    getRatingSkaterCategories = deps.getRatingSkaterCategories;
    getSkaterProfile = deps.getSkaterProfile;
    getGoalieProfile = deps.getGoalieProfile;
    getSkaterCategoryWeights = deps.getSkaterCategoryWeights;
    applySkaterTalentCategoryEmphasis = deps.applySkaterTalentCategoryEmphasis;
    computePlayerNhlSeasonValueScore = deps.computePlayerNhlSeasonValueScore;
    average = deps.average;
    roundScore = deps.roundScore;
    getScoreScale = deps.getScoreScale;
    applyAggregateModelCalibration = deps.applyAggregateModelCalibration;
    finalizeAggregateScore = deps.finalizeAggregateScore;
    getGoalieToiValue = deps.getGoalieToiValue;
    initialized = true;
  }

  function buildSkaterDistributions(rows, categories, dataModelName, posGroup) {
    var distributionLimit = getAggregateDistributionLimit(
      dataModelName,
      posGroup,
      getAggregateSeasonTypeKey(rows && rows[0]),
    );
    var scoreMode = getAggregateCategoryScoreMode(dataModelName);
    var retainedShare = getRetainedRangeShare(dataModelName, posGroup);
    var baselineRows =
      scoreMode === "retainedRange"
        ? getDayWeekBaselineRows(rows, dataModelName, posGroup)
        : rows;
    var raw = {};
    var rate = {};
    var rawMax = {};
    var rawBest = {};
    var rawFloor = {};
    var rateMax = {};
    var rateBest = {};
    var rateFloor = {};
    categories.forEach(function (category) {
      raw[category] = limitDistribution(
        sortedValuesByGetter(baselineRows, function (row) {
          return getComparableCategoryValue(
            row,
            category,
            posGroup,
            dataModelName,
          );
        }),
        distributionLimit,
        isLowerBetterStat(category),
      );
      rawMax[category] = maxSortedValue(raw[category]);
      rawBest[category] = isLowerBetterStat(category)
        ? minSortedValue(raw[category])
        : rawMax[category];
      rawFloor[category] = getRetainedRangeFloorValue(
        raw[category],
        isLowerBetterStat(category),
        retainedShare,
      );
      rate[category] = limitDistribution(
        sortedValuesByGetter(baselineRows, function (row) {
          return getUsageRateValue(row, category, posGroup, dataModelName);
        }),
        distributionLimit,
        isLowerBetterStat(category),
      );
      rateMax[category] = maxSortedValue(rate[category]);
      rateBest[category] = isLowerBetterStat(category)
        ? minSortedValue(rate[category])
        : rateMax[category];
      rateFloor[category] = getRetainedRangeFloorValue(
        rate[category],
        isLowerBetterStat(category),
        retainedShare,
      );
    });
    var usage = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getComparableUsageValue(row, posGroup, dataModelName);
      }),
      distributionLimit,
      false,
    );
    var rawUsage = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getUsageValue(row, posGroup, dataModelName);
      }),
      distributionLimit,
      false,
    );
    var event = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getComparableSkaterEventLoadValue(row, dataModelName);
      }),
      distributionLimit,
      false,
    );
    var rawEvent = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getSkaterEventLoadValue(row);
      }),
      distributionLimit,
      false,
    );
    return {
      scoreMode: scoreMode,
      raw: raw,
      rate: rate,
      rawMax: rawMax,
      rawBest: rawBest,
      rawFloor: rawFloor,
      rateMax: rateMax,
      rateBest: rateBest,
      rateFloor: rateFloor,
      usage: usage,
      usageMax: maxSortedValue(usage),
      usageBest: maxSortedValue(usage),
      usageFloor: getRetainedRangeFloorValue(usage, false, retainedShare),
      rawUsage: rawUsage,
      rawUsageMax: maxSortedValue(rawUsage),
      rawUsageBest: maxSortedValue(rawUsage),
      rawUsageFloor: getRetainedRangeFloorValue(rawUsage, false, retainedShare),
      event: event,
      eventMax: maxSortedValue(event),
      eventBest: maxSortedValue(event),
      eventFloor: getRetainedRangeFloorValue(event, false, retainedShare),
      rawEvent: rawEvent,
      rawEventMax: maxSortedValue(rawEvent),
      rawEventBest: maxSortedValue(rawEvent),
      rawEventFloor: getRetainedRangeFloorValue(rawEvent, false, retainedShare),
    };
  }

  function computeSkaterCategoryParts(
    row,
    category,
    profile,
    distributions,
    dataModelName,
  ) {
    var scoreMode = distributions.scoreMode || "distribution";
    var rawScore = computeAggregateCategoryScore(
      getComparableCategoryValue(row, category, PositionGroup.F, dataModelName),
      distributions.raw[category],
      distributions.rawMax[category],
      isLowerBetterStat(category),
      scoreMode,
      distributions.rawFloor[category],
      distributions.rawBest[category],
    );
    var rateScore = profile.categoryBlend.rate
      ? computeAggregateCategoryScore(
          getUsageRateValue(row, category, PositionGroup.F, dataModelName),
          distributions.rate[category],
          distributions.rateMax[category],
          isLowerBetterStat(category),
          scoreMode,
          distributions.rateFloor[category],
          distributions.rateBest[category],
        )
      : rawScore;
    rawScore = clampCategoryScore(rawScore, dataModelName);
    rateScore = clampCategoryScore(rateScore, dataModelName);
    var blendedScore =
      profile.categoryBlend.raw * rawScore +
      profile.categoryBlend.rate * rateScore;
    blendedScore = clampCategoryScore(blendedScore, dataModelName);
    return {
      rawScore: rawScore,
      rateScore: rateScore,
      blendedScore: blendedScore,
    };
  }

  function computeSkaterVolumeScore(
    row,
    profile,
    distributions,
    dataModelName,
  ) {
    var blend = profile.volumeScoreBlend || { normalized: 1, raw: 0 };
    var scoreMode = distributions.scoreMode || "distribution";
    var normalizedUsageScore = computeAggregateCategoryScore(
      getComparableUsageValue(row, PositionGroup.F, dataModelName),
      distributions.usage,
      distributions.usageMax,
      false,
      scoreMode,
      distributions.usageFloor,
      distributions.usageBest,
    );
    var normalizedEventScore = computeAggregateCategoryScore(
      getComparableSkaterEventLoadValue(row, dataModelName),
      distributions.event,
      distributions.eventMax,
      false,
      scoreMode,
      distributions.eventFloor,
      distributions.eventBest,
    );
    var normalizedScore =
      profile.volumeMix.usage * normalizedUsageScore +
      profile.volumeMix.event * normalizedEventScore;

    if (!blend.raw) return normalizedScore;

    var rawUsageScore = computeAggregateCategoryScore(
      getUsageValue(row, PositionGroup.F, dataModelName),
      distributions.rawUsage,
      distributions.rawUsageMax,
      false,
      scoreMode,
      distributions.rawUsageFloor,
      distributions.rawUsageBest,
    );
    var rawEventScore = computeAggregateCategoryScore(
      getSkaterEventLoadValue(row),
      distributions.rawEvent,
      distributions.rawEventMax,
      false,
      scoreMode,
      distributions.rawEventFloor,
      distributions.rawEventBest,
    );
    var rawScore =
      profile.volumeMix.usage * rawUsageScore +
      profile.volumeMix.event * rawEventScore;
    return blend.normalized * normalizedScore + blend.raw * rawScore;
  }

  function applySkaterSpecialistCap(
    score,
    profile,
    supportScore,
    breadthScore,
  ) {
    var cap = profile.specialistCap;
    if (!cap) return score;
    if (
      cap.maxBreadth !== undefined &&
      supportScore < cap.maxSupport &&
      breadthScore < cap.maxBreadth
    ) {
      return Math.min(score, cap.cap);
    }
    if (cap.maxBreadth === undefined && supportScore < cap.maxSupport) {
      return Math.min(score, cap.cap);
    }
    return score;
  }

  function applySkaterSmallSampleCaps(score, row, profile, dataModelName) {
    var usage = getUsageValue(row, PositionGroup.F, dataModelName);
    var caps = profile.smallSampleCaps || [];
    for (var i = 0; i < caps.length; i++) {
      var rule = caps[i];
      if (rule.maxUsage !== undefined && usage <= rule.maxUsage) {
        score = Math.min(score, rule.cap);
      }
      if (
        rule.maxUsageExclusive !== undefined &&
        usage < rule.maxUsageExclusive
      ) {
        score = Math.min(score, rule.cap);
      }
    }
    return score;
  }

  function maybeApplyBalancedBonus(
    score,
    profile,
    supportScore,
    breadthScore,
    volumeOrWorkload,
  ) {
    if (!profile.balancedBonus) return score;
    if (
      supportScore >= 0.75 &&
      breadthScore >= 0.6 &&
      volumeOrWorkload >= 0.55
    ) {
      return score + profile.balancedBonus;
    }
    return score;
  }

  function getSkaterDropScenarioWeights(dataModelName) {
    var normalizedModelName = normalizeModelName(dataModelName);
    if (normalizedModelName === "PlayerDayStatLine") {
      return [
        { dropCount: 3, weight: 0.5 },
        { dropCount: 2, weight: 0.35 },
        { dropCount: 1, weight: 0.1 },
        { dropCount: 0, weight: 0.05 },
      ];
    }
    if (normalizedModelName === "PlayerWeekStatLine") {
      return [
        { dropCount: 3, weight: 0.25 },
        { dropCount: 2, weight: 0.45 },
        { dropCount: 1, weight: 0.2 },
        { dropCount: 0, weight: 0.1 },
      ];
    }
    return [{ dropCount: 0, weight: 1 }];
  }

  function splitSkaterCategoryEntriesByDropCount(entries, dropCount) {
    var list = (entries || []).slice();
    if (!dropCount || list.length <= 1) {
      return { kept: list, dropped: [] };
    }

    var maxDrop = Math.max(0, Math.min(dropCount, list.length - 1));
    if (!maxDrop) {
      return { kept: list, dropped: [] };
    }

    var byWeakest = list.slice().sort(function (a, b) {
      var left = (Number(a && a.score) || 0) * (Number(a && a.weight) || 0);
      var right = (Number(b && b.score) || 0) * (Number(b && b.weight) || 0);
      if (left !== right) return left - right;
      return (Number(a && a.score) || 0) - (Number(b && b.score) || 0);
    });
    var droppedKeys = {};
    byWeakest.slice(0, maxDrop).forEach(function (entry) {
      if (!entry || !entry.category) return;
      droppedKeys[entry.category] = true;
    });

    return {
      kept: list.filter(function (entry) {
        return !droppedKeys[entry.category];
      }),
      dropped: list.filter(function (entry) {
        return !!droppedKeys[entry.category];
      }),
    };
  }

  function buildSkaterScenarioMetrics(entries, dataModelName, dropCount) {
    var retainedCategoryGroups = splitSkaterCategoryEntriesByDropCount(
      entries,
      dropCount,
    );
    var retainedCategoryEntries = retainedCategoryGroups.kept;
    var efficiencyScore =
      normalizeModelName(dataModelName) === "PlayerNHL"
        ? computeWeightedScoreAverage(
            getNhlBreadthEntries(retainedCategoryEntries),
          )
        : computeWeightedScoreAverage(retainedCategoryEntries);
    var supportScore = computeWeightedTopAverage(retainedCategoryEntries, 1, 4);
    var breadthEntries =
      normalizeModelName(dataModelName) === "PlayerNHL"
        ? getNhlBreadthEntries(retainedCategoryEntries)
        : retainedCategoryEntries.slice(
            0,
            Math.min(5, retainedCategoryEntries.length || 0),
          );
    var breadthScore = computeBreadthScore(
      breadthEntries.map(function (entry) {
        return entry.score;
      }),
      breadthEntries.length,
    );
    var starScore = computeWeightedTopAverage(
      retainedCategoryEntries,
      0,
      Math.min(3, retainedCategoryEntries.length || 0),
    );
    var coreScore =
      normalizeModelName(dataModelName) === "PlayerNHL"
        ? computePlayerNhlCoreScore(retainedCategoryEntries)
        : 0;

    return {
      retainedCategoryEntries: retainedCategoryEntries,
      droppedCategoryEntries: retainedCategoryGroups.dropped,
      efficiencyScore: efficiencyScore,
      supportScore: supportScore,
      breadthScore: breadthScore,
      starScore: starScore,
      coreScore: coreScore,
    };
  }

  function rankSkaterGroup(
    rows,
    poolRows,
    dataModelName,
    outputField,
    options,
  ) {
    ensureDeps();

    var seasonId = rows[0] && rows[0].seasonId;
    var categories = getRatingSkaterCategories(seasonId, dataModelName);
    var profile = getSkaterProfile(dataModelName);
    var posGroup = normalizePosGroup(rows[0] && rows[0].posGroup, rows[0]);
    var categoryWeights = getSkaterCategoryWeights(
      dataModelName,
      posGroup,
      categories,
    );
    var validPoolRows = (poolRows || []).filter(function (row) {
      return hasMeaningfulPlayerVolume(row, PositionGroup.F, dataModelName);
    });
    var distributions = buildSkaterDistributions(
      validPoolRows,
      categories,
      dataModelName,
      posGroup,
    );

    rows.forEach(function (row) {
      if (
        !hasMeaningfulPlayerVolume(row, PositionGroup.F, dataModelName) &&
        normalizeModelName(dataModelName) !== "PlayerNHL"
      ) {
        row[outputField] = "";
        row.Rating = outputField === "Rating" ? "" : row.Rating;
        return;
      }

      var categoryEntries = categories.map(function (category) {
        var categoryValue = toNumber(row && row[category]);
        var categoryParts = computeSkaterCategoryParts(
          row,
          category,
          profile,
          distributions,
          dataModelName,
        );
        var emphasizedScore = applySkaterTalentCategoryEmphasis(
          dataModelName,
          posGroup,
          category,
          categoryParts.blendedScore,
        );
        return {
          category: category,
          score: emphasizedScore,
          weight: categoryWeights[category] || 1,
          rawScore: categoryParts.rawScore,
          rateScore: categoryParts.rateScore,
          blendedScore: categoryParts.blendedScore,
          seasonValueScore:
            normalizeModelName(dataModelName) === "PlayerNHL"
              ? computePlayerNhlSeasonValueScore(
                  categoryValue,
                  distributions.raw[category],
                  category,
                  posGroup,
                )
              : 0,
          value: categoryValue,
          perGameValue: getUsageRateValue(
            row,
            category,
            PositionGroup.F,
            dataModelName,
          ),
        };
      });
      var volumeScore = computeSkaterVolumeScore(
        row,
        profile,
        distributions,
        dataModelName,
      );
      var weights = profile.weights;
      var scoreScale = getScoreScale(dataModelName);
      var scenarioWeights = getSkaterDropScenarioWeights(dataModelName);
      var droppedCategoryMap = {};
      var scenarioDebug = [];
      var blendedComponents = {
        efficiency: 0,
        support: 0,
        breadth: 0,
        star: 0,
        core: 0,
      };
      var score = scenarioWeights.reduce(function (sum, scenario) {
        var metrics = buildSkaterScenarioMetrics(
          categoryEntries,
          dataModelName,
          scenario.dropCount,
        );
        metrics.droppedCategoryEntries.forEach(function (entry) {
          if (!entry || !entry.category) return;
          if (!droppedCategoryMap[entry.category]) {
            droppedCategoryMap[entry.category] = [];
          }
          droppedCategoryMap[entry.category].push(scenario.dropCount);
        });

        blendedComponents.efficiency +=
          scenario.weight * metrics.efficiencyScore;
        blendedComponents.support += scenario.weight * metrics.supportScore;
        blendedComponents.breadth += scenario.weight * metrics.breadthScore;
        blendedComponents.star += scenario.weight * metrics.starScore;
        blendedComponents.core += scenario.weight * metrics.coreScore;

        var scenarioScore =
          scoreScale *
          (weights.efficiency * metrics.efficiencyScore +
            weights.support * metrics.supportScore +
            weights.breadth * metrics.breadthScore +
            weights.volume * volumeScore +
            (weights.star || 0) * metrics.starScore +
            (weights.core || 0) * metrics.coreScore);

        scenarioScore = maybeApplyBalancedBonus(
          scenarioScore,
          profile,
          metrics.supportScore,
          metrics.breadthScore,
          volumeScore,
        );
        scenarioScore = applySkaterSpecialistCap(
          scenarioScore,
          profile,
          metrics.supportScore,
          metrics.breadthScore,
        );
        scenarioScore = applySkaterSmallSampleCaps(
          scenarioScore,
          row,
          profile,
          dataModelName,
        );

        if (options && options.includeBreakdown) {
          scenarioDebug.push({
            dropCount: scenario.dropCount,
            weight: scenario.weight,
            keptCategories: metrics.retainedCategoryEntries.map(
              function (entry) {
                return entry.category;
              },
            ),
            droppedCategories: metrics.droppedCategoryEntries.map(
              function (entry) {
                return entry.category;
              },
            ),
            components: {
              efficiency: roundScore(metrics.efficiencyScore),
              support: roundScore(metrics.supportScore),
              breadth: roundScore(metrics.breadthScore),
              volume: roundScore(volumeScore),
              star: roundScore(metrics.starScore),
              core: roundScore(metrics.coreScore),
            },
            score: roundScore(scenarioScore),
          });
        }

        return sum + scenario.weight * scenarioScore;
      }, 0);
      score = applyAggregateModelCalibration(
        score,
        dataModelName,
        normalizePosGroup(row && row.posGroup, row),
      );

      row[outputField] = finalizeAggregateScore(score, dataModelName);

      if (options && options.includeBreakdown) {
        row.__ratingDebug = {
          dataModelName: normalizeModelName(dataModelName),
          posGroup: posGroup,
          categories: categoryEntries.map(function (entry) {
            return {
              category: entry.category,
              droppedScenarios: droppedCategoryMap[entry.category] || [],
              value: entry.value,
              comparableValue: roundScore(
                getComparableCategoryValue(
                  row,
                  entry.category,
                  PositionGroup.F,
                  dataModelName,
                ),
              ),
              perGameValue: roundScore(entry.perGameValue),
              rawScore: roundScore(entry.rawScore),
              rateScore: roundScore(entry.rateScore),
              blendedScore: roundScore(entry.blendedScore),
              emphasizedScore: roundScore(entry.score),
              seasonValueScore: roundScore(entry.seasonValueScore || 0),
              weight: entry.weight,
              weightedScore: roundScore(
                (Number(entry.score) || 0) * (Number(entry.weight) || 0),
              ),
            };
          }),
          components: {
            efficiency: roundScore(blendedComponents.efficiency),
            support: roundScore(blendedComponents.support),
            breadth: roundScore(blendedComponents.breadth),
            volume: roundScore(volumeScore),
            star: roundScore(blendedComponents.star),
            core: roundScore(blendedComponents.core),
          },
          weights: {
            efficiency: weights.efficiency || 0,
            support: weights.support || 0,
            breadth: weights.breadth || 0,
            volume: weights.volume || 0,
            star: weights.star || 0,
            core: weights.core || 0,
          },
          scenarioBlend: scenarioDebug,
          usageValue: roundScore(
            getUsageValue(row, PositionGroup.F, dataModelName),
          ),
          comparableUsageValue: roundScore(
            getComparableUsageValue(row, PositionGroup.F, dataModelName),
          ),
          eventLoadValue: roundScore(getSkaterEventLoadValue(row)),
          comparableEventLoadValue: roundScore(
            getComparableSkaterEventLoadValue(row, dataModelName),
          ),
          finalScore: row[outputField],
        };
      }
    });
  }

  function buildGoalieDistributions(rows, dataModelName) {
    var distributionLimit = getAggregateDistributionLimit(
      dataModelName,
      PositionGroup.G,
      getAggregateSeasonTypeKey(rows && rows[0]),
    );
    var scoreMode = getAggregateCategoryScoreMode(dataModelName);
    var retainedShare = getRetainedRangeShare(dataModelName, PositionGroup.G);
    var baselineRows =
      scoreMode === "retainedRange"
        ? getDayWeekBaselineRows(rows, dataModelName, PositionGroup.G)
        : rows;
    var rawW = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getComparableCategoryValue(
          row,
          "W",
          PositionGroup.G,
          dataModelName,
        );
      }),
      distributionLimit,
      false,
    );
    var rawGaa = limitDistribution(
      sortedValues(baselineRows, "GAA"),
      distributionLimit,
      true,
    );
    var rawSvp = limitDistribution(
      sortedValues(baselineRows, "SVP"),
      distributionLimit,
      false,
    );
    var rateW = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getUsageRateValue(row, "W", PositionGroup.G, dataModelName);
      }),
      distributionLimit,
      false,
    );
    var gs = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getComparableUsageValue(row, PositionGroup.G, dataModelName);
      }),
      distributionLimit,
      false,
    );
    var sa = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getComparableCategoryValue(
          row,
          "SA",
          PositionGroup.G,
          dataModelName,
        );
      }),
      distributionLimit,
      false,
    );
    var ga = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getComparableCategoryValue(
          row,
          "GA",
          PositionGroup.G,
          dataModelName,
        );
      }),
      distributionLimit,
      true,
    );
    var sv = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getComparableCategoryValue(
          row,
          "SV",
          PositionGroup.G,
          dataModelName,
        );
      }),
      distributionLimit,
      false,
    );
    var toi = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getComparableCategoryValue(
          row,
          "TOI",
          PositionGroup.G,
          dataModelName,
        );
      }),
      distributionLimit,
      false,
    );
    return {
      scoreMode: scoreMode,
      raw: {
        W: rawW,
        GAA: rawGaa,
        SVP: rawSvp,
      },
      rawMax: {
        W: maxSortedValue(rawW),
        GAA: maxSortedValue(rawGaa),
        SVP: maxSortedValue(rawSvp),
      },
      rawBest: {
        W: maxSortedValue(rawW),
        GAA: minSortedValue(rawGaa),
        SVP: maxSortedValue(rawSvp),
      },
      rawFloor: {
        W: getRetainedRangeFloorValue(rawW, false, retainedShare),
        GAA: getRetainedRangeFloorValue(rawGaa, true, retainedShare),
        SVP: getRetainedRangeFloorValue(rawSvp, false, retainedShare),
      },
      rate: {
        W: rateW,
      },
      rateMax: {
        W: maxSortedValue(rateW),
      },
      rateBest: {
        W: maxSortedValue(rateW),
      },
      rateFloor: {
        W: getRetainedRangeFloorValue(rateW, false, retainedShare),
      },
      GS: gs,
      GSMax: maxSortedValue(gs),
      GSBest: maxSortedValue(gs),
      GSFloor: getRetainedRangeFloorValue(gs, false, retainedShare),
      SA: sa,
      SAMax: maxSortedValue(sa),
      SABest: maxSortedValue(sa),
      SAFloor: getRetainedRangeFloorValue(sa, false, retainedShare),
      GA: ga,
      GAMax: maxSortedValue(ga),
      GABest: minSortedValue(ga),
      GAFloor: getRetainedRangeFloorValue(ga, true, retainedShare),
      SV: sv,
      SVMax: maxSortedValue(sv),
      SVBest: maxSortedValue(sv),
      SVFloor: getRetainedRangeFloorValue(sv, false, retainedShare),
      TOI: toi,
      TOIMax: maxSortedValue(toi),
      TOIBest: maxSortedValue(toi),
      TOIFloor: getRetainedRangeFloorValue(toi, false, retainedShare),
    };
  }

  function computeGoalieWinScore(row, profile, distributions, dataModelName) {
    var scoreMode = distributions.scoreMode || "distribution";
    var rawScore = computeAggregateCategoryScore(
      getComparableCategoryValue(row, "W", PositionGroup.G, dataModelName),
      distributions.raw.W,
      distributions.rawMax.W,
      false,
      scoreMode,
      distributions.rawFloor.W,
      distributions.rawBest.W,
    );
    rawScore = clampCategoryScore(rawScore, dataModelName);
    if (!profile.winBlend.rate) return rawScore;
    var rateScore = computeAggregateCategoryScore(
      getUsageRateValue(row, "W", PositionGroup.G, dataModelName),
      distributions.rate.W,
      distributions.rateMax.W,
      false,
      scoreMode,
      distributions.rateFloor.W,
      distributions.rateBest.W,
    );
    rateScore = clampCategoryScore(rateScore, dataModelName);
    return clampCategoryScore(
      profile.winBlend.raw * rawScore + profile.winBlend.rate * rateScore,
      dataModelName,
    );
  }

  function computeGoalieWorkloadScore(
    row,
    profile,
    distributions,
    dataModelName,
  ) {
    var mix = (profile && profile.workloadMix) || {};
    var scoreMode = distributions.scoreMode || "distribution";
    var score = 0;
    if (mix.GS) {
      score +=
        mix.GS *
        computeAggregateCategoryScore(
          getComparableUsageValue(row, PositionGroup.G, dataModelName),
          distributions.GS,
          distributions.GSMax,
          false,
          scoreMode,
          distributions.GSFloor,
          distributions.GSBest,
        );
    }
    if (mix.SA) {
      score +=
        mix.SA *
        computeAggregateCategoryScore(
          getComparableCategoryValue(row, "SA", PositionGroup.G, dataModelName),
          distributions.SA,
          distributions.SAMax,
          false,
          scoreMode,
          distributions.SAFloor,
          distributions.SABest,
        );
    }
    if (mix.GA) {
      score +=
        mix.GA *
        computeAggregateCategoryScore(
          getComparableCategoryValue(row, "GA", PositionGroup.G, dataModelName),
          distributions.GA,
          distributions.GAMax,
          true,
          scoreMode,
          distributions.GAFloor,
          distributions.GABest,
        );
    }
    if (mix.SV) {
      score +=
        mix.SV *
        computeAggregateCategoryScore(
          getComparableCategoryValue(row, "SV", PositionGroup.G, dataModelName),
          distributions.SV,
          distributions.SVMax,
          false,
          scoreMode,
          distributions.SVFloor,
          distributions.SVBest,
        );
    }
    if (mix.TOI) {
      score +=
        mix.TOI *
        computeAggregateCategoryScore(
          getComparableCategoryValue(
            row,
            "TOI",
            PositionGroup.G,
            dataModelName,
          ),
          distributions.TOI,
          distributions.TOIMax,
          false,
          scoreMode,
          distributions.TOIFloor,
          distributions.TOIBest,
        );
    }
    return score;
  }

  function applyGoalieSpecialistCap(
    score,
    profile,
    categoryScores,
    supportScore,
  ) {
    var cap = profile.specialistCap;
    if (!cap) return score;
    if (cap.type === "singleElite") {
      var eliteCount = categoryScores.filter(function (value) {
        return value >= cap.threshold;
      }).length;
      if (eliteCount <= 1) return Math.min(score, cap.cap);
      return score;
    }
    if (cap.type === "support" && supportScore < cap.maxSupport) {
      return Math.min(score, cap.cap);
    }
    return score;
  }

  function applyGoalieSmallSampleCap(
    score,
    row,
    profile,
    workloadScore,
    dataModelName,
  ) {
    var rule = profile.smallSampleCap;
    if (!rule) return score;
    var usage = getUsageValue(row, PositionGroup.G, dataModelName);
    if (rule.maxUsage !== undefined && usage <= rule.maxUsage) {
      if (rule.minWorkload === undefined || workloadScore < rule.minWorkload) {
        return Math.min(score, rule.cap);
      }
    }
    if (
      rule.maxUsageExclusive !== undefined &&
      usage < rule.maxUsageExclusive
    ) {
      return Math.min(score, rule.cap);
    }
    return score;
  }

  function applyGoalieToiCap(score, row) {
    var toi = getGoalieToiValue(row);
    if (toi <= GOALIE_MINIMUM_TOI_FOR_RATING) return 0;
    if (toi >= GOALIE_NEGLIGIBLE_TOI_THRESHOLD) return score;

    var toiCap =
      GOALIE_NEGLIGIBLE_TOI_MAX_SCORE *
      clip(toi / GOALIE_NEGLIGIBLE_TOI_THRESHOLD, 0, 1);
    return Math.min(score, toiCap);
  }

  function rankGoalieGroup(rows, poolRows, dataModelName, outputField) {
    ensureDeps();

    var profile = getGoalieProfile(dataModelName);
    var validPoolRows = (poolRows || []).filter(function (row) {
      return hasMeaningfulPlayerVolume(row, PositionGroup.G, dataModelName);
    });
    var distributions = buildGoalieDistributions(validPoolRows, dataModelName);

    rows.forEach(function (row) {
      if (
        !hasMeaningfulPlayerVolume(row, PositionGroup.G, dataModelName) &&
        normalizeModelName(dataModelName) !== "PlayerNHL"
      ) {
        row[outputField] = "";
        return;
      }

      if (getGoalieToiValue(row) <= GOALIE_MINIMUM_TOI_FOR_RATING) {
        row[outputField] = 0;
        return;
      }

      var scoreMode = distributions.scoreMode || "distribution";
      var coreScores = {
        W: computeGoalieWinScore(row, profile, distributions, dataModelName),
        GAA: clampCategoryScore(
          computeAggregateCategoryScore(
            toNumber(row && row.GAA),
            distributions.raw.GAA,
            distributions.rawMax.GAA,
            true,
            scoreMode,
            distributions.rawFloor.GAA,
            distributions.rawBest.GAA,
          ),
          dataModelName,
        ),
        SVP: clampCategoryScore(
          computeAggregateCategoryScore(
            toNumber(row && row.SVP),
            distributions.raw.SVP,
            distributions.rawMax.SVP,
            false,
            scoreMode,
            distributions.rawFloor.SVP,
            distributions.rawBest.SVP,
          ),
          dataModelName,
        ),
      };
      var categoryValues = [coreScores.W, coreScores.GAA, coreScores.SVP];
      var efficiencyScore = weightedAverage(coreScores, {
        W: 0.3,
        GAA: 0.35,
        SVP: 0.35,
      });
      var supportScore = computeSupportScore(categoryValues, 2);
      var breadthScore = computeBreadthScore(
        categoryValues,
        categoryValues.length,
      );
      var workloadScore = computeGoalieWorkloadScore(
        row,
        profile,
        distributions,
        dataModelName,
      );
      var weights = profile.weights;
      var scoreScale = getScoreScale(dataModelName);
      var score =
        scoreScale *
        (weights.efficiency * efficiencyScore +
          weights.support * supportScore +
          weights.breadth * breadthScore +
          weights.workload * workloadScore);

      score = maybeApplyBalancedBonus(
        score,
        profile,
        supportScore,
        breadthScore,
        workloadScore,
      );
      score = applyGoalieSpecialistCap(
        score,
        profile,
        categoryValues,
        supportScore,
      );
      score = applyGoalieSmallSampleCap(
        score,
        row,
        profile,
        workloadScore,
        dataModelName,
      );
      score = applyAggregateModelCalibration(
        score,
        dataModelName,
        normalizePosGroup(row && row.posGroup, row),
      );
      score = applyGoalieToiCap(score, row);

      row[outputField] = finalizeAggregateScore(score, dataModelName);
    });
  }

  api.rankSkaterGroup = rankSkaterGroup;
  api.rankGoalieGroup = rankGoalieGroup;
  api.internals = {
    buildSkaterDistributions: buildSkaterDistributions,
    buildGoalieDistributions: buildGoalieDistributions,
  };

  ns.PlayerPure = api;
})(RankingEngine);

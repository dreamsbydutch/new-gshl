/**
 * Player Seasonal Aggregation
 * - Aggregates PlayerWeekStatLine into PlayerSplitStatLine (season+gshlTeam per player)
 * - Aggregates PlayerWeekStatLine into PlayerTotalStatLine (season totals per player)
 */

function aggregatePlayerSeasonSplits() {
  try {
    console.log("Starting player season SPLITS aggregation...");

    const workbook = getWorkbook("player stats");
    const readResult = readTypedSheet(workbook, "PlayerWeekStatLine");
    if (!readResult.success) return { success: false, error: readResult.error };

    const weeks = readResult.data;
    if (!weeks || weeks.length === 0) {
      console.log("No PlayerWeekStatLine rows to aggregate into splits");
      return { success: false, error: "No data found" };
    }

    // Load week metadata from GENERAL to classify RS vs PO
    const weekMeta = readSheetData("GENERAL", "Week");
    const weekTypeById = new Map();
    for (let i = 0; i < weekMeta.length; i++) {
      const w = weekMeta[i];
      weekTypeById.set(toNumber(w.id), w.weekType);
    }
    const toSeasonType = (wt) => {
      const s = (wt || "").toString().toUpperCase();
      // Playoffs buckets
      if (s === "PO" || s === "QF" || s === "SF" || s === "F") return "PO";
      // Regular season buckets
      if (s === "RS" || s === "CC" || s === "NC") return "RS";
      return "RS";
    };

    // Group by seasonId + seasonType + playerId + gshlTeamId
    const groups = {};
    for (let i = 0; i < weeks.length; i++) {
      const w = weeks[i];
      const wt = weekTypeById.get(toNumber(w.weekId));
      const seasonType = toSeasonType(wt);
      const key = `${w.seasonId}_${seasonType}_${w.playerId}_${w.gshlTeamId}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(w);
    }

    const sumFields = [
      "days",
      "GP",
      "MG",
      "IR",
      "IRplus",
      "GS",
      "G",
      "A",
      "P",
      "PM",
      "PIM",
      "PPP",
      "SOG",
      "HIT",
      "BLK",
      "W",
      "GA",
      "SV",
      "SA",
      "SO",
      "TOI",
      "ADD",
      "MS",
      "BS",
    ];

    const aggregator = createAggregator("PlayerWeekStatLine");
    const createSplit = createTypedObjectFactory("PlayerSplitStatLine");

    const out = [];
    let id = 1;
    const now = new Date();
    for (const key in groups) {
      const rows = groups[key];
      const first = rows[0];
      const summed = aggregator.sum(rows, sumFields);
      const computed = {
        GAA: summed.TOI > 0 ? (summed.GA / summed.TOI) * 60 : 0,
        SVP: summed.SA > 0 ? summed.SV / summed.SA : 0,
        Rating: 0, // calculated by separate rating job
      };
      const firstVals = aggregator.first(rows, [
        "seasonId",
        "gshlTeamId",
        "playerId",
        "nhlPos",
        "posGroup",
        "nhlTeam",
      ]);
      const wt = weekTypeById.get(toNumber(first.weekId));
      const seasonType = toSeasonType(wt);

      const rec = createSplit({
        id: id++,
        seasonType,
        ...firstVals,
        days: summed.days,
        ...summed,
        ...computed,
        createdAt: now,
        updatedAt: now,
      });
      out.push(rec);
    }

    const writeResult = writeTypedSheet(workbook, "PlayerSplitStatLine", out, {
      chunkSize: 100,
      clearFirst: true,
    });

    if (writeResult.success) {
      console.log(
        `✅ Aggregated ${writeResult.rowsWritten} player season splits successfully`,
      );
    } else {
      console.error(
        `❌ Player season splits aggregation failed: ${writeResult.error}`,
      );
    }

    return writeResult;
  } catch (error) {
    console.error("❌ Player season splits aggregation failed:", error.message);
    return { success: false, error: error.message };
  }
}

function aggregatePlayerSeasonTotals() {
  try {
    console.log("Starting player season TOTALS aggregation...");

    const workbook = getWorkbook("player stats");
    const readResult = readTypedSheet(workbook, "PlayerWeekStatLine");
    if (!readResult.success) return { success: false, error: readResult.error };

    const weeks = readResult.data;
    if (!weeks || weeks.length === 0) {
      console.log("No PlayerWeekStatLine rows to aggregate into totals");
      return { success: false, error: "No data found" };
    }

    // Load week metadata from GENERAL to classify RS vs PO
    const weekMeta = readSheetData("GENERAL", "Week");
    const weekTypeById = new Map();
    for (let i = 0; i < weekMeta.length; i++) {
      const w = weekMeta[i];
      weekTypeById.set(toNumber(w.id), w.weekType);
    }
    const toSeasonType = (wt) => {
      const s = (wt || "").toString().toUpperCase();
      // Playoffs buckets
      if (s === "PO" || s === "QF" || s === "SF" || s === "F") return "PO";
      // Regular season buckets
      if (s === "RS" || s === "CC" || s === "NC") return "RS";
      return "RS";
    };

    // Group by seasonId + seasonType + playerId
    const groups = {};
    for (let i = 0; i < weeks.length; i++) {
      const w = weeks[i];
      const wt = weekTypeById.get(toNumber(w.weekId));
      const seasonType = toSeasonType(wt);
      const key = `${w.seasonId}_${seasonType}_${w.playerId}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(w);
    }

    const sumFields = [
      "days",
      "GP",
      "MG",
      "IR",
      "IRplus",
      "GS",
      "G",
      "A",
      "P",
      "PM",
      "PIM",
      "PPP",
      "SOG",
      "HIT",
      "BLK",
      "W",
      "GA",
      "SV",
      "SA",
      "SO",
      "TOI",
      "ADD",
      "MS",
      "BS",
    ];

    const aggregator = createAggregator("PlayerWeekStatLine");
    const createTotal = createTypedObjectFactory("PlayerTotalStatLine");

    const out = [];
    let id = 1;
    const now = new Date();
    for (const key in groups) {
      const rows = groups[key];
      const first = rows[0];
      const summed = aggregator.sum(rows, sumFields);
      const computed = {
        GAA: summed.TOI > 0 ? (summed.GA / summed.TOI) * 60 : 0,
        SVP: summed.SA > 0 ? summed.SV / summed.SA : 0,
        Rating: 0,
      };
      const firstVals = aggregator.first(rows, [
        "seasonId",
        "playerId",
        "nhlPos",
        "posGroup",
        "nhlTeam",
      ]);
      const wt = weekTypeById.get(toNumber(first.weekId));
      const seasonType = toSeasonType(wt);

      // Collect unique gshlTeamIds
      const teamSet = new Set();
      for (let i = 0; i < rows.length; i++) {
        const tid = rows[i].gshlTeamId;
        if (tid != null && tid !== "") teamSet.add(String(tid).trim());
      }
      const gshlTeamIds = Array.from(teamSet)
        .map((s) => Number(s))
        .filter((n) => !isNaN(n))
        .sort((a, b) => a - b)
        .join(",");

      const rec = createTotal({
        id: id++,
        seasonType,
        ...firstVals,
        gshlTeamIds: String(gshlTeamIds), // ensure string
        days: summed.days,
        ...summed,
        ...computed,
        createdAt: now,
        updatedAt: now,
      });
      out.push(rec);
    }

    // Ensure the destination column is formatted as plain text to avoid numeric coercion
    const destSheet = workbook.getSheetByName("PlayerTotalStatLine");
    if (destSheet) {
      const lastCol = destSheet.getLastColumn();
      if (lastCol > 0) {
        const headers = destSheet.getRange(1, 1, 1, lastCol).getValues()[0];
        const col = headers.indexOf("gshlTeamIds") + 1;
        if (col > 0) {
          destSheet
            .getRange(2, col, Math.max(out.length, 1), 1)
            .setNumberFormat("@");
        }
      }
    }

    const writeResult = writeTypedSheet(workbook, "PlayerTotalStatLine", out, {
      chunkSize: 100,
      clearFirst: true,
    });

    if (writeResult.success) {
      console.log(
        `✅ Aggregated ${writeResult.rowsWritten} player season totals successfully`,
      );
    } else {
      console.error(
        `❌ Player season totals aggregation failed: ${writeResult.error}`,
      );
    }

    return writeResult;
  } catch (error) {
    console.error("❌ Player season totals aggregation failed:", error.message);
    return { success: false, error: error.message };
  }
}

function aggregatePlayerSeasons() {
  const splits = aggregatePlayerSeasonSplits();
  const totals = aggregatePlayerSeasonTotals();
  return { splits, totals };
}

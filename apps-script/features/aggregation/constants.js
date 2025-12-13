// @ts-nocheck

/**
 * Aggregation constants shared across player, team, and matchup modules.
 * Use defensive re-declaration to avoid duplicate definitions when clasp
 * concatenates files in an arbitrary order.
 */
var SeasonType =
  typeof SeasonType !== "undefined"
    ? SeasonType
    : {
        REGULAR_SEASON: "RS",
        PLAYOFFS: "PO",
        LOSERS_TOURNAMENT: "LT",
      };

var TEAM_STAT_FIELDS =
  typeof TEAM_STAT_FIELDS !== "undefined"
    ? TEAM_STAT_FIELDS
    : [
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

var MATCHUP_CATEGORY_RULES =
  typeof MATCHUP_CATEGORY_RULES !== "undefined"
    ? MATCHUP_CATEGORY_RULES
    : [
        { field: "G", higherBetter: true },
        { field: "A", higherBetter: true },
        { field: "P", higherBetter: true },
        { field: "PPP", higherBetter: true },
        { field: "SOG", higherBetter: true },
        { field: "HIT", higherBetter: true },
        { field: "BLK", higherBetter: true },
        { field: "W", higherBetter: true },
        { field: "GAA", higherBetter: false },
        { field: "SVP", higherBetter: true },
      ];

var GOALIE_CATEGORY_SET =
  typeof GOALIE_CATEGORY_SET !== "undefined"
    ? GOALIE_CATEGORY_SET
    : new Set(["W", "GAA", "SVP"]);

var GOALIE_START_MINIMUM =
  typeof GOALIE_START_MINIMUM !== "undefined" ? GOALIE_START_MINIMUM : 2;

var PLAYER_DAY_STAT_FIELDS =
  typeof PLAYER_DAY_STAT_FIELDS !== "undefined"
    ? PLAYER_DAY_STAT_FIELDS
    : [
        "G",
        "A",
        "P",
        "PPP",
        "SOG",
        "HIT",
        "BLK",
        "W",
        "GA",
        "GAA",
        "SV",
        "SA",
        "SVP",
        "TOI",
      ];

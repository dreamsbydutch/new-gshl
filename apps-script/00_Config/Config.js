/**
 * GSHL Apps Script Configuration
 *
 * This Apps Script project scrapes Yahoo Fantasy Hockey rosters
 * and writes PlayerDay records to Google Sheets.
 */

/**
 * Google Sheets Configuration
 *
 * GENERAL workbook - Contains all master/reference tables:
 * - Season, Week, Team, Player, Franchise, Owner, etc.
 */
const SPREADSHEET_ID = "1I6kmnnL6rSAWLOG12Ixr89g4W-ZQ0weGbfETKDTrvH8";

/**
 * PlayerDay workbooks - Partitioned by season ranges
 *
 * Use the appropriate workbook based on which season you're writing to:
 * - Seasons 1-5:   PLAYERDAYS_1_5
 * - Seasons 6-10:  PLAYERDAYS_6_10
 * - Seasons 11-15: PLAYERDAYS_11_15
 *
 * Current season (Season 12) uses PLAYERDAYS_11_15
 */
const PLAYERDAY_WORKBOOKS = {
  PLAYERDAYS_1_5: "18IqgstBaBIAfM08w7ddzjF2JTrAqZUjAvsbyZxgHiag",
  PLAYERDAYS_6_10: "14XZoxMbcmWh0-XmYOu16Ur0HNOFP9UttHbiMMut_PJ0",
  PLAYERDAYS_11_15: "18IqgstBaBIAfM08w7ddzjF2JTrAqZUjAvsbyZxgHiag",
};

/**
 * Current season's PlayerDay workbook
 * Update this when moving to a new season range
 */
const CURRENT_PLAYERDAY_SPREADSHEET_ID = PLAYERDAY_WORKBOOKS.PLAYERDAYS_11_15;

/**
 * Player Stats workbook - Contains aggregated player statistics:
 * - PlayerWeek, PlayerSplit, PlayerTotal, PlayerNHL
 */
const PLAYERSTATS_SPREADSHEET_ID =
  "1qkyxmx8gC-xs8niDrmlB9Jv6qXhRmAWjFCq8ECEr-Cg";

/**
 * Team Stats workbook - Contains aggregated team statistics:
 * - TeamDay, TeamWeek, TeamSeason
 */
const TEAMSTATS_SPREADSHEET_ID = "1X2pvw18aYEekdNApyJMqijOZL1Bl0e3Azlkg-eb2X54";

/**
 * Yahoo Fantasy Hockey Configuration
 *
 * Your Yahoo league ID - you can find this in your Yahoo Fantasy URL:
 * https://hockey.fantasysports.yahoo.com/hockey/{LEAGUE_ID}/
 */
const YAHOO_LEAGUE_ID = "6989";

/**
 * Environment feature flags
 * These default values can be overridden at runtime via Script Properties:
 *   VERBOSE_LOGGING = true | false
 *   DRY_RUN_MODE    = true | false
 */
const ENABLE_VERBOSE_LOGGING = true;
const ENABLE_DRY_RUN_MODE = false;

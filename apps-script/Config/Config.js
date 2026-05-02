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
 * PlayerDay workbooks - Partitioned by season
 *
 * Use the appropriate workbook based on which season you're writing to:
 * - Season 1:  PLAYERDAYS_01 / PlayerDays-01
 * - Season 2:  PLAYERDAYS_02 / PlayerDays-02
 * - etc.
 *
 * Current season (Season 12) uses PLAYERDAYS_12
 */
const PLAYERDAY_WORKBOOKS = {
  PLAYERDAYS_01: "1L0lqm3DDXv92hml67aGgJ2AYT49hitMl0GX16VZOCrg",
  PLAYERDAYS_02: "1M-YNvrUtfLKqv0b5MJ6HWErMvL9pTm6_TRrb6-1Dz0Y",
  PLAYERDAYS_03: "1-qtE0DSueGi47h-l5pBSJik4Y8knDq8r64zH94FYdXU",
  PLAYERDAYS_04: "1G7wBlYgSliyzh1N2U6sqOeDfiDeNcT7cDY9OUkWxDn4",
  PLAYERDAYS_05: "1ny8gEOotQCbG3uvr29JgX5iRjCS_2Pt44eF4f4l3f1g",
  PLAYERDAYS_06: "1nOp4mi_0kskY5etY70ErpSGYcKevouEwhe3Nh3VwZ_8",
  PLAYERDAYS_07: "1spmkDwfKOiMZBQt4-roOeIuL88m457X0F9inHa_zw4c",
  PLAYERDAYS_08: "1i7rqNNJrHUZT7SIisesJzHNVJfVz2lZExUB6XHsc2vw",
  PLAYERDAYS_09: "1Ffb0gqr-tm3HECUIA2vPNUFfs04XLTg51JX7tQ3xETM",
  PLAYERDAYS_10: "1x7KS6XsSCtbgZ5rxGqH6NNCS91ZHNH-lWJc84ZPmkO0",
  PLAYERDAYS_11: "1eai9BxtIXcaWBKzNI0BCn-kcjf06Hszx4aFXAkAGqVw",
  PLAYERDAYS_12: "1M1CLZ9FXqq7dWtgpNZa4OFoUU3h71N1bLxZTmprqVKk",
  PLAYERDAYS_13: "1980OlOIIK7OegX-yd3WICSiReeHpUROi8x0i4x6TtYI",
  PLAYERDAYS_14: "",
  PLAYERDAYS_15: "",
};

/**
 * Current season's PlayerDay workbook
 * Update this when moving to a new season
 */
const CURRENT_PLAYERDAY_SPREADSHEET_ID = PLAYERDAY_WORKBOOKS.PLAYERDAYS_12;

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

/**
 * Yahoo Fantasy Hockey Roster Scraper
 * ====================================
 * Scrapes team roster data from Yahoo Fantasy Hockey pages using HTML parsing.
 *
 * @description
 * This scraper extracts comprehensive player data from Yahoo Fantasy roster pages:
 * - Player identification (ID, name, NHL team, positions)
 * - Lineup positioning and injury status
 * - Game status (opponent, score, time)
 * - Statistical categories (goals, assists, saves, etc.)
 * - Performance ratings using trained ML model
 *
 * @features
 * - Parallel team scraping with configurable concurrency
 * - Robust HTML parsing with multiple selector fallbacks
 * - Automatic player type detection (skater vs goalie)
 * - Derived stat calculations (GP, GS, TOI)
 * - Rating calculation integration
 * - Comprehensive error recovery
 *
 * @usage
 * ```ts
 * const scraper = createYahooScraper('123456', ['1', '2', '3'], {
 *   cookies: 'session=...',
 *   targetDate: '2024-01-15',
 *   seasonId: '7',
 *   concurrency: 3
 * });
 * const rosters = await scraper.scrapeAllTeams();
 * ```
 *
 * @module YahooRosterScraper
 */

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import pLimit from "p-limit";
import * as fs from "fs";
import * as path from "path";

import { RosterPosition } from "@gshl-types";
import { PositionGroup } from "@gshl-types";
import { rankPerformance } from "@gshl-ranking";
import type { RankingModel } from "@gshl-ranking";

// ============================================================================
// Configuration Constants
// ============================================================================

/** Default number of teams scraped in parallel. Conservative to avoid throttling. */
const DEFAULT_CONCURRENCY = 2;

/** Default request timeout (in milliseconds). */
const DEFAULT_TIMEOUT = 30_000;

/** Browser-like User-Agent to keep Yahoo happy. */
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";


// ============================================================================
// Type Definitions
// ============================================================================

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Valid injury tags from Yahoo Fantasy Hockey.
 */
export type InjuryTag =
  | "DTD" // Day-to-Day
  | "O" // Out
  | "IR" // Injured Reserve
  | "IR-LT" // Injured Reserve - Long Term
  | "IR-NR" // Injured Reserve - Non-Roster
  | "COVID-19" // COVID-19 Protocol
  | "SUSP" // Suspended
  | "NA" // Not Active
  | "NR"; // Non-Roster

/**
 * Configuration for the Yahoo roster scraper.
 */
export interface YahooRosterScraperConfig {
  leagueId: string;
  teamIds: string[];
  /** Cookie header copied from an authenticated Yahoo session. */
  cookies?: string;
  /** Request User-Agent header. */
  userAgent?: string;
  /** Target date (YYYY-MM-DD). Defaults to Yahoo's current date. */
  targetDate?: string;
  /** Season ID for rating calculation (e.g., "7", "8"). */
  seasonId?: string;
  /** Concurrency for parallel scraping (defaults to 2). */
  concurrency?: number;
  /** Request timeout in ms (defaults to 30s). */
  timeout?: number;
}

/**
 * Canonical stat payload per player.
 */
export type YahooPlayerStats = Record<string, string | number | null>;

/**
 * Player entry extracted from the Yahoo roster HTML.
 */
export interface YahooPlayerData {
  playerId: string;
  playerName: string;
  nhlTeam: string;
  positions: string[];
  lineupPosition: string;
  isOnIR: boolean;
  isOnIRPlus: boolean;
  injuryTag: InjuryTag | null;
  playerType: "skater" | "goalie";
  stats?: YahooPlayerStats;
  // Game information
  opponent?: string;
  score?: string;
  teamPlayed?: boolean;
}

/**
 * Roster information returned for a single team.
 */
export interface YahooTeamRoster {
  teamId: string;
  teamName: string;
  ownerName: string;
  scrapedAt: Date;
  targetDate?: string;
  players: YahooPlayerData[];
  errors?: string[];
}

/**
 * Internal helper type for the stat index map.
 */
type StatIndexMap = Map<number, string>;

// ============================================================================
// Stat Mapping Configuration
// ============================================================================

/**
 * Mapping of Yahoo lineup slot codes to internal roster positions.
 */
const YAHOO_POSITION_MAP: Record<string, RosterPosition> = {
  C: RosterPosition.C,
  LW: RosterPosition.LW,
  RW: RosterPosition.RW,
  W: RosterPosition.C,
  D: RosterPosition.D,
  G: RosterPosition.G,
  BN: RosterPosition.BN,
  IR: RosterPosition.IR,
  "IR+": RosterPosition.IRPlus,
  Util: RosterPosition.Util,
  UTIL: RosterPosition.Util,
};

/**
 * Yahoo stat header aliases mapped to canonical stat keys.
 */
const STAT_HEADER_ALIASES: Record<string, string> = {
  GP: "GP",
  G: "G",
  A: "A",
  P: "P",
  PTS: "P",
  "+-": "PM",
  "+/-": "PM",
  PM: "PM",
  PIM: "PIM",
  PPP: "PPP",
  PPG: "PPP",
  PPA: "PPP",
  SOG: "SOG",
  S: "SOG",
  SHOTS: "SOG",
  HIT: "HIT",
  HITS: "HIT",
  BLK: "BLK",
  BLKS: "BLK",
  BS: "BS",
  MS: "MS",
  W: "W",
  GA: "GA",
  GAA: "GAA",
  SV: "SV",
  SA: "SA",
  "SV%": "SVP",
  SVP: "SVP",
  SO: "SO",
  SHO: "SO",
  RATING: "RATING",
  R: "RATING",
  ADD: "ADD",
  // Handle Yahoo's asterisk notation for goalie stats
  "GA*": "GA",
  "SV*": "SV",
  "SA*": "SA",
  // Full stat names from Yahoo header rows
  GOALS: "G",
  ASSISTS: "A",
  POINTS: "P",
  "PLUS/MINUS": "PM",
  "PENALTY MINUTES": "PIM",
  "POWERPLAY POINTS": "PPP",
  "SHOTS ON GOAL": "SOG",
  BLOCKS: "BLK",
  WINS: "W",
  "GOALS AGAINST": "GA",
  "GOALS AGAINST AVERAGE": "GAA",
  SAVES: "SV",
  "SHOTS AGAINST": "SA",
  "SAVE PERCENTAGE": "SVP",
  SHUTOUTS: "SO",
};

/** Stat headers we intentionally ignore. */
const STAT_HEADER_SKIP = new Set([
  "",
  "POS",
  "POSITION",
  "SLOT",
  "PLAYER",
  "PLAYER, TEAM",
  "PLAYER,TEAM",
  "STATUS",
  "ACTION",
  "ACTIONS",
  "OPP",
  "ACQUISITION",
  "NOTE",
  "TEAM",
  "PRE-SEASON",
  "PRE SEASON",
  "CURRENT",
  "% START",
  "% ROS",
  "%START",
  "%ROS",
  "GOALTENDERS",
  "RANKINGS",
  "FANTASY",
  "OFFENSE",
  "GOALTENDING",
]);

/** Set of stat keys we allow in the canonical mapping. */
const ALLOWED_STAT_KEYS = new Set([
  // Skater stats
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  // Goalie stats
  "W",
  "GA",
  "GAA",
  "SV",
  "SA",
  "SVP",
  "SO",
  // Calculated fields (added by scraper logic)
  "GP",
  "GS",
  "TOI",
  "PPD",
  "MG",
  "BS",
  "MS",
  "ADD",
  "RATING",
]);

/** Skater-specific stat keys */
const SKATER_STAT_KEYS = new Set([
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
]);

/** Goalie-specific stat keys */
const GOALIE_STAT_KEYS = new Set(["W", "GA", "GAA", "SV", "SA", "SVP", "SO"]);

/**
 * Canonical stat keys we expose to consumers.
 */
const LEGACY_STAT_KEY_MAP: Record<string, string> = {
  GP: "GP",
  PPD: "PPD",
  MG: "MG",
  GS: "GS",
  G: "G",
  A: "A",
  P: "P",
  PM: "PM",
  PIM: "PIM",
  PPP: "PPP",
  SOG: "SOG",
  HIT: "HIT",
  BLK: "BLK",
  BS: "BS",
  MS: "MS",
  TOI: "TOI",
  W: "W",
  GA: "GA",
  GAA: "GAA",
  SV: "SV",
  SA: "SA",
  SVP: "SVP",
  SO: "SO",
  ADD: "ADD",
  RATING: "Rating",
};

/**
 * Config for the roster scraper.
 */
export interface YahooRosterScraperConfig {
  leagueId: string;
  teamIds: string[];
  /** Cookie header copied from an authenticated Yahoo session. */
  cookies?: string;
  /** Request User-Agent header. */
  userAgent?: string;
  /** Target date (YYYY-MM-DD). Defaults to Yahoo's current date. */
  targetDate?: string;
  /** Season ID for rating calculation (e.g., "7", "8"). */
  seasonId?: string;
  /** Concurrency for parallel scraping (defaults to 2). */
  concurrency?: number;
  /** Request timeout in ms (defaults to 30s). */
  timeout?: number;
}
// ============================================================================
// Model Loading
// ============================================================================

/**
 * Load the ranking model from file.
 * Searches multiple possible paths relative to the current working directory.
 */
function loadRankingModel(): RankingModel | null {
  try {
    // Try multiple possible paths (from server context)
    const possiblePaths = [
      path.join(process.cwd(), "ranking-model.json"),
      path.join(process.cwd(), "../ranking-model.json"),
      path.join(process.cwd(), "../../ranking-model.json"),
    ];

    for (const modelPath of possiblePaths) {
      if (fs.existsSync(modelPath)) {
        const modelData = fs.readFileSync(modelPath, "utf-8");
        const model = JSON.parse(modelData) as RankingModel;
        console.log(`[YahooScraper] ✅ Loaded ranking model from ${modelPath}`);
        return model;
      }
    }

    console.warn(
      "[YahooScraper] Warning: ranking-model.json not found, ratings will not be calculated",
    );
    return null;
  } catch (error) {
    console.error("[YahooScraper] Error loading ranking model:", error);
    return null;
  }
}

// Load the model once at module initialization
const RANKING_MODEL = loadRankingModel();

// ============================================================================
// Yahoo Roster Scraper Class
// ============================================================================

/**
 * Yahoo Fantasy Hockey HTML roster scraper.
 *
 * @description
 * Main scraper class that orchestrates fetching and parsing Yahoo roster pages.
 * Uses Cheerio for HTML parsing and p-limit for concurrency control.
 */
export class YahooRosterScraper {
  private readonly config: Required<
    Omit<YahooRosterScraperConfig, "targetDate" | "seasonId">
  > &
    Pick<YahooRosterScraperConfig, "targetDate" | "seasonId">;

  private readonly limiter: <T>(fn: () => Promise<T>) => Promise<T>;

  // Track whether we've logged warnings to avoid spamming console
  private hasLoggedMissingModel = false;
  private hasLoggedMissingSeasonId = false;

  constructor(config: YahooRosterScraperConfig) {
    this.config = {
      concurrency: DEFAULT_CONCURRENCY,
      timeout: DEFAULT_TIMEOUT,
      cookies: "",
      userAgent: DEFAULT_USER_AGENT,
      targetDate: config.targetDate,
      seasonId: config.seasonId,
      leagueId: config.leagueId,
      teamIds: config.teamIds,
    };

    this.limiter = pLimit(this.config.concurrency);
  }

  // --------------------------------------------------------------------------
  // Public API Methods
  // --------------------------------------------------------------------------

  /**
   * Scrape rosters for all configured teams in parallel.
   * Uses concurrency limiting to avoid overwhelming Yahoo servers.
   */
  async scrapeAllTeams(): Promise<YahooTeamRoster[]> {
    const tasks = this.config.teamIds.map((teamId) =>
      this.limiter(() => this.scrapeTeamRoster(teamId)),
    );

    return Promise.all(tasks);
  }

  /**
   * Scrape the roster for a single team.
   * Fetches HTML, parses structure, extracts players and stats.
   */
  async scrapeTeamRoster(teamId: string): Promise<YahooTeamRoster> {
    const url = this.buildTeamUrl(teamId);
    const errors: string[] = [];

    try {
      const html = await this.fetchPage(url);
      const $ = cheerio.load(html);

      const teamName = this.extractTeamName($);
      const ownerName = this.extractOwnerName($);
      const players = this.extractPlayers($, errors);

      return {
        teamId,
        teamName,
        ownerName,
        scrapedAt: new Date(),
        targetDate: this.config.targetDate,
        players,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Failed to scrape team ${teamId}:`, message);

      return {
        teamId,
        teamName: "",
        ownerName: "",
        scrapedAt: new Date(),
        targetDate: this.config.targetDate,
        players: [],
        errors: [message],
      };
    }
  }

  // --------------------------------------------------------------------------
  // HTTP & URL Utilities
  // --------------------------------------------------------------------------

  /**
   * Build the roster URL for a team/date combination.
   */
  private buildTeamUrl(teamId: string): string {
    const base = `https://hockey.fantasysports.yahoo.com/hockey/${this.config.leagueId}/${teamId}`;

    if (this.config.targetDate) {
      const separator = base.includes("?") ? "&" : "?";
      return `${base}${separator}date=${encodeURIComponent(this.config.targetDate)}`;
    }

    return base;
  }

  /**
   * Fetch HTML content from Yahoo with timeout and authentication headers.
   */
  private async fetchPage(url: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.config.userAgent,
          Cookie: this.config.cookies,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // --------------------------------------------------------------------------
  // Team Metadata Extraction
  // --------------------------------------------------------------------------

  /**
   * Extract the team name from the roster page.
   * Tries multiple selectors for robustness.
   */
  private extractTeamName($: cheerio.CheerioAPI): string {
    return (
      $(".Navitem--teamname").text().trim() ||
      $('[data-testid="team-name"]').text().trim() ||
      $(".team-name").text().trim() ||
      ""
    );
  }

  /**
   * Extract the owner name from the roster page.
   * Tries multiple selectors for robustness.
   */
  private extractOwnerName($: cheerio.CheerioAPI): string {
    return (
      $(".owner-name").text().trim() ||
      $('[data-testid="owner-name"]').text().trim() ||
      ""
    );
  }

  // --------------------------------------------------------------------------
  // Player Extraction & Table Parsing
  // --------------------------------------------------------------------------

  /**
   * Extract every player across all roster tables (skaters and goalies).
   */
  private extractPlayers(
    $: cheerio.CheerioAPI,
    errors: string[],
  ): YahooPlayerData[] {
    const players: YahooPlayerData[] = [];
    const rosterTables = $("table[id^='statTable']");

    if (rosterTables.length === 0) {
      errors.push("No roster tables found - check HTML selectors");
      return players;
    }

    rosterTables.each((tableIndex: number, tableNode: AnyNode) => {
      const $table = $(tableNode);
      const tableId = $table.attr("id") ?? `statTable-${tableIndex}`;

      // Determine if this is skaters or goalies table
      const playerType = this.determineTableType($table, tableId);
      const statIndexMap = this.buildStatIndexMapForTable(
        $,
        $table,
        playerType,
      );

      if (statIndexMap.size === 0) {
        errors.push(
          `No stat headers detected for table ${tableId}; category stats will be empty`,
        );
      }

      $table.find("tbody tr").each((rowIndex: number, row: AnyNode) => {
        try {
          const $row = $(row);
          const player = this.extractPlayerFromRow(
            $,
            $row,
            statIndexMap,
            playerType,
          );
          if (player) {
            players.push(player);
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown parse error";
          errors.push(`Table ${tableId} row ${rowIndex}: ${message}`);
        }
      });
    });

    return players;
  }

  // --------------------------------------------------------------------------
  // Table Type & Header Detection
  // --------------------------------------------------------------------------

  /**
   * Determine if table contains skaters or goalies based on table ID and headers.
   * Uses Yahoo's naming convention (statTable0 = skaters, statTable1 = goalies).
   */
  private determineTableType(
    $table: cheerio.Cheerio<AnyNode>,
    tableId: string,
  ): "skater" | "goalie" {
    // statTable0 = skaters, statTable1 = goalies (typical Yahoo pattern)
    if (tableId === "statTable1") {
      return "goalie";
    }
    if (tableId === "statTable0") {
      return "skater";
    }

    // Fallback: check for goalie-specific headers
    const headerText = $table.find("thead").text().toUpperCase();
    if (
      headerText.includes("GAA") ||
      headerText.includes("SV%") ||
      headerText.includes("SAVES")
    ) {
      return "goalie";
    }

    return "skater"; // Default to skater
  }

  /**
   * Build a column index to stat key map for a table header.
   * Handles colspan attributes for multi-column headers.
   */
  private buildStatIndexMapForTable(
    $: cheerio.CheerioAPI,
    $table: cheerio.Cheerio<AnyNode>,
    playerType: "skater" | "goalie" = "skater",
  ): StatIndexMap {
    const map: StatIndexMap = new Map();
    if ($table.length === 0) {
      return map;
    }

    const headerRows = $table.find("thead tr");
    if (headerRows.length === 0) {
      return map;
    }

    const targetRow = headerRows.last();
    let columnIndex = 0;

    targetRow.find("th").each((_colIndex: number, cell: AnyNode) => {
      const $cell = $(cell);
      const colspanAttr = $cell.attr("colspan");
      const span = colspanAttr ? Number.parseInt(colspanAttr, 10) || 1 : 1;
      const key = this.resolveStatHeader($cell, playerType);

      for (let offset = 0; offset < span; offset += 1) {
        if (key) {
          map.set(columnIndex, key);
        }
        columnIndex += 1;
      }
    });

    return map;
  }

  // --------------------------------------------------------------------------
  // Stat Header Normalization
  // --------------------------------------------------------------------------

  /**
   * Resolve stat header from cell attributes and text.
   * Tries multiple sources in order of precedence.
   */
  private resolveStatHeader(
    $cell: cheerio.Cheerio<AnyNode>,
    playerType?: "skater" | "goalie",
  ): string | null {
    const candidate = firstNonEmpty(
      $cell.attr("data-stat"),
      $cell.attr("title"),
      $cell.find("abbr[title]").first().attr("title"),
      $cell.find("abbr").first().text(),
      $cell.text(),
    );

    if (!candidate) {
      return null;
    }

    return this.normalizeStatKey(candidate, playerType);
  }

  /**
   * Normalize any stat key to canonical representation.
   * Handles Yahoo's various stat naming conventions and filters by player type.
   */
  private normalizeStatKey(
    raw: string,
    playerType?: "skater" | "goalie",
  ): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // Normalize whitespace and case
    const compact = trimmed.replace(/\s+/g, " ").toUpperCase();

    // Skip headers we don't want
    if (STAT_HEADER_SKIP.has(compact)) return null;

    // Try exact alias match first (handles cases like "GA*" -> "GA")
    let key = STAT_HEADER_ALIASES[compact];

    if (!key) {
      // Try removing asterisks and special characters
      const cleaned = compact.replace(/[^A-Z0-9%]/g, "");
      key = STAT_HEADER_ALIASES[cleaned] ?? cleaned;
    }

    if (!key || !ALLOWED_STAT_KEYS.has(key)) {
      return null;
    }

    // Filter by player type if specified
    if (playerType === "skater" && !SKATER_STAT_KEYS.has(key)) {
      return null;
    }
    if (playerType === "goalie" && !GOALIE_STAT_KEYS.has(key)) {
      return null;
    }

    return key;
  }

  // --------------------------------------------------------------------------
  // Cell Value Parsing
  // --------------------------------------------------------------------------

  /**
   * Extract the human-readable text from a stat cell.
   * Normalizes whitespace and removes non-breaking spaces.
   */
  private extractCellText($cell: cheerio.Cheerio<AnyNode>): string {
    return $cell
      .text()
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Convert raw stat cell content into a numeric/string payload.
   * Handles percentages, dashes (empty values), and numeric conversion.
   */
  private parseStatValue(value: string): string | number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed === "-" || trimmed === "—" || trimmed === "–") {
      return null;
    }

    const percentMatch = /^(-?\d+(?:\.\d+)?)%$/.exec(trimmed);
    if (percentMatch) {
      const numericPercent = Number(percentMatch[1]);
      return Number.isNaN(numericPercent) ? null : numericPercent;
    }

    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }

    return trimmed;
  }

  // --------------------------------------------------------------------------
  // Player Row Extraction (Main Parser)
  // --------------------------------------------------------------------------

  /**
   * Extract a single player from a roster table row.
   * This is the main parsing logic that extracts all player data including:
   * - Basic info (ID, name, NHL team, positions)
   * - Lineup position and injury status
   * - Game information (opponent, score, status)
   * - Statistical categories
   * - Derived stats and performance ratings
   */
  private extractPlayerFromRow(
    $: cheerio.CheerioAPI,
    $row: cheerio.Cheerio<AnyNode>,
    statIndexMap: StatIndexMap,
    playerType: "skater" | "goalie",
  ): YahooPlayerData | null {
    const cells = $row.find("td");
    if (cells.length < 2) {
      return null;
    }

    const lineupPosition = this.extractCellText(cells.eq(0));
    const playerCell = cells.eq(1);
    const playerLink = playerCell.find("a").first();
    const playerName = playerLink.text().trim();

    const directPlayerId = firstNonEmpty(
      playerLink.attr("data-ysf-playerid"),
      playerCell.attr("data-ysf-playerid"),
      playerCell.find("[data-ysf-playerid]").attr("data-ysf-playerid"),
    );

    const href = playerLink.attr("href") ?? "";
    const hrefMatch =
      /playerid=(\d+)/i.exec(href) ?? /\/(\d+)(?:[^\d]|$)/.exec(href);
    const playerId = firstNonEmpty(directPlayerId, hrefMatch?.[1]) ?? "";

    if (!playerId || !playerName) {
      return null;
    }

    // Extract team and position from the nested span structure
    // Try to get from .ysf-player-name > .D-b > .Fz-xxs (most specific)
    let metadata = playerCell
      .find(".ysf-player-name .D-b .Fz-xxs")
      .first()
      .text()
      .trim();

    // Fallback to other .Fz-xxs elements if not found
    if (!metadata) {
      const allFzxxs = playerCell.find(".Fz-xxs");
      // Look for one that matches the team-position pattern
      allFzxxs.each((i, el) => {
        const text = $(el).text().trim();
        if (/[A-Z]{2,3}\s*-\s*[\w,\s]+/.test(text)) {
          metadata = text;
          return false; // break
        }
      });
    }

    // Final fallback
    if (!metadata) {
      metadata =
        playerCell.find(".Fz-xxs").last().text().trim() ||
        playerCell.text().trim();
    }

    const metaMatch = /([A-Z]{2,3})\s*-\s*([\w,\s]+)/.exec(metadata);

    const nhlTeam = metaMatch?.[1] ?? "";
    const positionsStr = metaMatch?.[2] ?? "";
    const positions = Array.from(
      new Set(
        positionsStr
          .split(",")
          .map((position) => position.trim().toUpperCase())
          .filter(Boolean),
      ),
    );

    // Extract injury status from .ysf-player-status span
    let injuryBadge = playerCell
      .find(".ysf-player-status")
      .text()
      .trim()
      .toUpperCase();

    // Also check for .ysf-player-badge as fallback
    if (!injuryBadge) {
      injuryBadge = playerCell
        .find(".ysf-player-badge")
        .text()
        .trim()
        .toUpperCase();
    }

    // Normalize injury tag variations (Yahoo uses different formats)
    // LT-IR, LTIR -> IR-LT
    // NR-IR -> IR-NR
    let normalizedTag = injuryBadge;
    if (injuryBadge === "LT-IR" || injuryBadge === "LTIR") {
      normalizedTag = "IR-LT";
    } else if (injuryBadge === "NR-IR" || injuryBadge === "NRIR") {
      normalizedTag = "IR-NR";
    }

    // Parse specific injury tag
    const validInjuryTags: InjuryTag[] = [
      "DTD",
      "O",
      "IR",
      "IR-LT",
      "IR-NR",
      "COVID-19",
      "SUSP",
      "NA",
      "NR",
    ];
    const injuryTag: InjuryTag | null = normalizedTag
      ? (validInjuryTags.find((tag) => normalizedTag === tag) ?? null)
      : null;

    // Legacy boolean flags for backward compatibility
    // IRplus: Can be any injury designation (all tags are valid)
    // IR: Any injury designation EXCEPT DTD and O
    const isOnIRPlus = injuryTag !== null;
    const isOnIR =
      injuryTag !== null && injuryTag !== "DTD" && injuryTag !== "O";

    // Extract game status from player name cell
    // Format typically: "L,1-4 vs COL" or "W,3-2 vs CHI" embedded in the player cell
    const gameStatusText = playerCell.find(".ysf-game-status").text().trim();

    // Also get full player cell text as fallback
    const fullPlayerCellText = playerCell.text().trim();

    // Parse opponent and score - will be populated from columns or cell text
    let opponent = "";
    let score = "";
    let teamPlayed = false;

    // Try extracting from .ysf-game-status first
    if (gameStatusText) {
      // Pattern 1: Completed game "L,1-4 vs COL" or "W,3-2 vs CHI"
      const completedMatch =
        /([WL]),?\s*([\d]+-[\d]+)\s+(?:vs|@)\s+([A-Z]{2,3})/i.exec(
          gameStatusText,
        );
      if (completedMatch) {
        score = `${completedMatch[1]!.toUpperCase()},${completedMatch[2]}`;
        opponent = completedMatch[3]!.toUpperCase();
        teamPlayed = true;
      }
      // Pattern 2: Intermission "End 1st, 1-2 vs CHI" or "End 2nd, 2-1 @ PHI"
      else {
        const intermissionMatch =
          /(End\s+(?:1st|2nd|3rd)),\s*([\d]+-[\d]+)\s+(?:vs|@)\s+([A-Z]{2,3})/i.exec(
            gameStatusText,
          );
        if (intermissionMatch) {
          const intermissionLabel = intermissionMatch[1]; // e.g., "End 1st"
          const gameScore = intermissionMatch[2]; // e.g., "1-2"
          score = `${intermissionLabel}, ${gameScore}`; // e.g., "End 1st, 1-2"
          opponent = intermissionMatch[3]!.toUpperCase();
          teamPlayed = true; // Game is in progress
        }
        // Pattern 3: Live game "2nd 16:58, 1-2 @ PHI" or "1st 5:01, 1-0 vs BUF"
        else {
          const liveMatch =
            /((?:1st|2nd|3rd|OT|SO)\s+[\d:]+),\s*([\d]+-[\d]+)\s+(?:vs|@)\s+([A-Z]{2,3})/i.exec(
              gameStatusText,
            );
          if (liveMatch) {
            const periodTime = liveMatch[1]; // e.g., "2nd 16:58"
            const gameScore = liveMatch[2]; // e.g., "1-2"
            score = `${periodTime}, ${gameScore}`; // e.g., "2nd 16:58, 1-2"
            opponent = liveMatch[3]!.toUpperCase();
            teamPlayed = true; // Game is in progress
          }
          // Pattern 4: Future game with time "10:00 pm @ VGK" or "7:30 pm vs CAR"
          else {
            const futureMatch =
              /([\d:]+\s*(?:am|pm))\s+(?:vs|@)\s+([A-Z]{2,3})/i.exec(
                gameStatusText,
              );
            if (futureMatch) {
              score = futureMatch[1]!; // Store game time in score column (e.g., "10:00 pm")
              opponent = futureMatch[2]!.toUpperCase();
              // No teamPlayed - game hasn't started
            }
            // Pattern 5: Simple "vs NYR" or "@ TOR"
            else {
              const simpleMatch = /(?:vs|@)\s+([A-Z]{2,3})/i.exec(
                gameStatusText,
              );
              if (simpleMatch) {
                opponent = simpleMatch[1]!.toUpperCase();
              }
            }
          }
        }
      }
    }

    // If not found in .ysf-game-status, search the entire player cell text
    if (!opponent && fullPlayerCellText) {
      // Try all patterns on full cell text
      const completedMatch =
        /([WL]),?\s*([\d]+-[\d]+)\s+(?:vs|@)\s+([A-Z]{2,3})/i.exec(
          fullPlayerCellText,
        );
      if (completedMatch) {
        score = `${completedMatch[1]!.toUpperCase()},${completedMatch[2]}`;
        opponent = completedMatch[3]!.toUpperCase();
        teamPlayed = true;
      } else {
        const intermissionMatch =
          /(End\s+(?:1st|2nd|3rd)),\s*([\d]+-[\d]+)\s+(?:vs|@)\s+([A-Z]{2,3})/i.exec(
            fullPlayerCellText,
          );
        if (intermissionMatch) {
          const intermissionLabel = intermissionMatch[1];
          const gameScore = intermissionMatch[2];
          score = `${intermissionLabel}, ${gameScore}`;
          opponent = intermissionMatch[3]!.toUpperCase();
          teamPlayed = true;
        } else {
          const liveMatch =
            /((?:1st|2nd|3rd|OT|SO)\s+[\d:]+),\s*([\d]+-[\d]+)\s+(?:vs|@)\s+([A-Z]{2,3})/i.exec(
              fullPlayerCellText,
            );
          if (liveMatch) {
            const periodTime = liveMatch[1];
            const gameScore = liveMatch[2];
            score = `${periodTime}, ${gameScore}`;
            opponent = liveMatch[3]!.toUpperCase();
            teamPlayed = true;
          } else {
            const futureMatch =
              /([\d:]+\s*(?:am|pm))\s+(?:vs|@)\s+([A-Z]{2,3})/i.exec(
                fullPlayerCellText,
              );
            if (futureMatch) {
              score = futureMatch[1]!;
              opponent = futureMatch[2]!.toUpperCase();
            }
          }
        }
      }
    }

    const statsByCanonicalKey: Record<string, string | number | null> = {};
    const rawCellData = new Map<number, string>(); // Store raw cell text by index

    $row.find("td").each((cellIndex: number, cell: AnyNode) => {
      const $cell = $(cell);
      const cellText = this.extractCellText($cell);
      rawCellData.set(cellIndex, cellText);

      const headerKey = statIndexMap.get(cellIndex);
      const attrKey = this.normalizeStatKey(
        $cell.attr("data-stat") ?? "",
        playerType,
      );
      const key = headerKey ?? attrKey;
      if (!key) {
        return;
      }

      const parsedValue = this.parseStatValue(cellText);
      statsByCanonicalKey[key] = parsedValue;
    });

    // Extract opponent and score from raw cell data if not found in player cell
    // Yahoo shows this in the player name cell or in separate columns
    // Patterns we've seen:
    // - "L, 1-4 vs COL" (full game info in player cell)
    // - "W, 3-2 vs CHI" (full game info in player cell)
    // - Just "COL" in Opp column + score elsewhere
    // - "vs COL" or "@ COL"

    // Define valid NHL team codes (32 teams)
    const NHL_TEAMS = new Set([
      "ANA",
      "BOS",
      "BUF",
      "CGY",
      "CAR",
      "CHI",
      "COL",
      "CBJ",
      "DAL",
      "DET",
      "EDM",
      "FLA",
      "LA",
      "MIN",
      "MTL",
      "NSH",
      "NJ",
      "NYI",
      "NYR",
      "OTT",
      "PHI",
      "PIT",
      "SJ",
      "SEA",
      "STL",
      "TB",
      "TOR",
      "VAN",
      "VGK",
      "WPG",
      "WSH",
      "ARI",
    ]);

    // Scan all cells after player name for game data
    for (const [cellIndex, cellText] of rawCellData.entries()) {
      // Skip position and player name columns (indices 0 and 1)
      if (cellIndex <= 1) continue;

      const trimmed = cellText.trim();
      if (!trimmed || trimmed === "-") continue;

      // Pattern 1: Full game info "W,3-2 vs CHI" or "L,1-4 vs COL" (note: no space after comma)
      // Also handle with spaces "W, 3-2 vs CHI" for backward compatibility
      const fullGameMatch =
        /([WL]),?\s*([\d]+-[\d]+)\s+(?:vs|@)\s+([A-Z]{2,3})/i.exec(trimmed);
      if (fullGameMatch) {
        const winLoss = fullGameMatch[1]!.toUpperCase();
        const scorePart = fullGameMatch[2];
        const oppPart = fullGameMatch[3];

        if (scorePart) {
          score = `${winLoss},${scorePart}`;
        }
        if (oppPart && NHL_TEAMS.has(oppPart.toUpperCase())) {
          opponent = oppPart.toUpperCase();
        }
        if (oppPart) teamPlayed = true;
        continue;
      }

      // Pattern 2: Score with W/L prefix "W,3-2" or "L,1-4" (no space after comma)
      const scoreMatch = /^([WL]),?\s*([\d]+-[\d]+)$/i.exec(trimmed);
      if (scoreMatch && !score) {
        const winLoss = scoreMatch[1]!.toUpperCase();
        score = `${winLoss},${scoreMatch[2]}`;
        teamPlayed = true;
        continue;
      }

      // Pattern 3: Opponent with vs/@ prefix "vs COL" or "@ NYR"
      const oppWithPrefixMatch = /^(?:vs|@)\s*([A-Z]{2,3})$/i.exec(trimmed);
      if (oppWithPrefixMatch) {
        const oppCode = oppWithPrefixMatch[1]!.toUpperCase();
        if (!opponent && NHL_TEAMS.has(oppCode)) {
          opponent = oppCode;
          teamPlayed = true;
        }
        continue;
      }

      // Pattern 4: Just opponent code "COL", "CHI", etc.
      const upperTrimmed = trimmed.toUpperCase();
      if (!opponent && NHL_TEAMS.has(upperTrimmed)) {
        opponent = upperTrimmed;
        teamPlayed = true;
        continue;
      }

      // Pattern 5: Score without W/L just "3-2" or "1-4"
      if (!score && /^[\d]+-[\d]+$/.test(trimmed)) {
        score = trimmed;
        teamPlayed = true;
        continue;
      }
    }

    // Debug logging for game data extraction
    if (playerName) {
      // Log if we found game data
      if (opponent || score) {
        console.log(
          `[Scraper] ${playerName}: opponent="${opponent}", score="${score}", teamPlayed=${teamPlayed}`,
        );
      }
      // Log the first player's cell text to debug
      if (playerName === "Sidney Crosby" || playerName === "Anze Kopitar") {
        console.log(
          `[Debug] ${playerName} gameStatusText: "${gameStatusText}"`,
        );
        console.log(
          `[Debug] ${playerName} fullPlayerCellText: "${fullPlayerCellText.substring(0, 200)}"`,
        );
      }
    }

    const legacyStats: YahooPlayerStats = {};
    let hasAnyStat = false;

    for (const [canonicalKey, finalKey] of Object.entries(
      LEGACY_STAT_KEY_MAP,
    )) {
      const value = statsByCanonicalKey[canonicalKey];
      if (value !== undefined && value !== null) {
        hasAnyStat = true;
      }
      legacyStats[finalKey] = value ?? null;
    }

    // Calculate derived stats
    if (hasAnyStat) {
      // GP: Games Played - if player has any stats, they played
      legacyStats.GP = 1;

      // GS: Games Started - if GP = 1 and in the active lineup (not BN, IR, or IR+)
      const nonStartingPositions = new Set(["BN", "IR", "IR+"]);
      const normalizedPosition = lineupPosition.trim().toUpperCase();
      legacyStats.GS =
        legacyStats.GP === 1 && !nonStartingPositions.has(normalizedPosition)
          ? 1
          : 0;

      // TOI: Time on Ice for goalies - calculate from GA and GAA
      if (playerType === "goalie") {
        const ga = legacyStats.GA;
        const gaa = legacyStats.GAA;

        if (
          typeof ga === "number" &&
          typeof gaa === "number" &&
          ga !== null &&
          gaa !== null
        ) {
          if (gaa === 0) {
            // If GAA is 0, assume full 60 minutes played
            legacyStats.TOI = 60;
          } else {
            // TOI = (GA * 60) / GAA
            legacyStats.TOI = Math.round((ga * 60) / gaa);
          }
        }
      }

      // RATING: Calculate player performance rating using trained model
      if (RANKING_MODEL && this.config.seasonId) {
        try {
          // Determine position group
          let posGroup: PositionGroup;
          if (playerType === "goalie") {
            posGroup = PositionGroup.G;
          } else if (positions.includes("D")) {
            posGroup = PositionGroup.D;
          } else {
            posGroup = PositionGroup.F;
          }

          // Helper to convert to string
          const toStr = (val: string | number | null | undefined): string => {
            if (val === null || val === undefined) return "0";
            return String(val);
          };

          // Prepare stat line for ranking (PlayerStatLine expects strings)
          const statLine = {
            seasonId: this.config.seasonId,
            posGroup,
            GP: legacyStats.GP,
            G: toStr(legacyStats.G),
            A: toStr(legacyStats.A),
            P: toStr(legacyStats.P),
            PM: toStr(legacyStats.PM),
            PPP: toStr(legacyStats.PPP),
            SOG: toStr(legacyStats.SOG),
            HIT: toStr(legacyStats.HIT),
            BLK: toStr(legacyStats.BLK),
            W: toStr(legacyStats.W),
            GA: toStr(legacyStats.GA),
            GAA: toStr(legacyStats.GAA),
            SV: toStr(legacyStats.SV),
            SA: toStr(legacyStats.SA),
            SVP: toStr(legacyStats.SVP),
          };

          const result = rankPerformance(statLine, RANKING_MODEL);

          // Set rating if it's a valid number (including 0)
          if (!isNaN(result.score)) {
            legacyStats.Rating = Math.round(result.score * 1000) / 1000; // Round to 3 decimals
          } else {
            // If calculation fails, set to 0 for players who played
            legacyStats.Rating = 0;
          }
        } catch (error) {
          console.warn(
            `[YahooScraper] Failed to calculate rating for ${playerName}:`,
            error,
          );
          // Set to 0 if calculation fails
          legacyStats.Rating = 0;
        }
      } else if (!RANKING_MODEL) {
        // Only log once per scraper instance
        if (!this.hasLoggedMissingModel) {
          console.warn(
            "[YahooScraper] Ranking model not loaded - ratings will not be calculated",
          );
          this.hasLoggedMissingModel = true;
        }
      } else if (!this.config.seasonId) {
        // Only log once per scraper instance
        if (!this.hasLoggedMissingSeasonId) {
          console.warn(
            "[YahooScraper] Season ID not provided - ratings will not be calculated",
          );
          this.hasLoggedMissingSeasonId = true;
        }
      }
    }

    return {
      playerId,
      playerName,
      nhlTeam,
      positions,
      lineupPosition,
      isOnIR,
      isOnIRPlus,
      injuryTag,
      playerType,
      stats: hasAnyStat ? legacyStats : undefined,
      opponent,
      score,
      teamPlayed,
    };
  }

  // --------------------------------------------------------------------------
  // Static Utility Methods
  // --------------------------------------------------------------------------

  /**
   * Map Yahoo lineup slots to canonical roster positions.
   * Provides a static method for position mapping without requiring class instantiation.
   */
  static mapYahooPosition(yahooPos: string): RosterPosition {
    const normalized = yahooPos.trim().toUpperCase();
    return YAHOO_POSITION_MAP[normalized] ?? RosterPosition.BN;
  }
}

// ============================================================================
// Factory & Helper Functions
// ============================================================================

/**
 * Convenience factory to create a scraper with sane defaults.
 * Automatically pulls Yahoo session cookie from environment variables.
 */
export function createYahooScraper(
  leagueId: string,
  teamIds: string[],
  options: Omit<YahooRosterScraperConfig, "leagueId" | "teamIds"> = {},
): YahooRosterScraper {
  return new YahooRosterScraper({
    leagueId,
    teamIds,
    cookies: process.env.YAHOO_SESSION_COOKIE ?? "",
    concurrency: DEFAULT_CONCURRENCY,
    ...options,
  });
}

/**
 * Simple async delay helper for rate limiting.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Return the first non-empty trimmed string from the provided values.
 * Used for fallback value selection in HTML parsing.
 */
function firstNonEmpty(
  ...values: Array<string | undefined | null>
): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

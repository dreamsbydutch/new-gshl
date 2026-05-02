// @ts-nocheck

/**
 * Refreshes PlayerNHL season stats from Hockey Reference.
 *
 * Source pages:
 * - https://www.hockey-reference.com/leagues/NHL_<YEAR>_skaters.html
 * - https://www.hockey-reference.com/leagues/NHL_<YEAR>_goalies.html
 */
var PlayerNhlStatsUpdater = (function PlayerNhlStatsUpdaterModule() {
  "use strict";

  var ns = {};
  var htmlCacheByUrl = {};
  var FETCH_RETRY_DELAYS_MS = [1500, 4000, 9000];
  var FETCH_DELAY_BETWEEN_SOURCE_PAGES_MS = 1200;

  var NHL_TEAM_ALIASES = {
    ANH: "ANA",
    ARZ: "ARI",
    CLB: "CBJ",
    CLS: "CBJ",
    "L.A": "LAK",
    LA: "LAK",
    MTL: "MTL",
    MON: "MTL",
    "N.J": "NJD",
    NJ: "NJD",
    NASH: "NSH",
    NAS: "NSH",
    "S.J": "SJS",
    SJ: "SJS",
    "T.B": "TBL",
    TB: "TBL",
    VEG: "VGK",
    WAS: "WSH",
  };

  function requireSeasonId(seasonId, caller) {
    var seasonKey =
      seasonId === undefined || seasonId === null
        ? ""
        : typeof seasonId === "string"
          ? seasonId.trim()
          : String(seasonId);
    if (!seasonKey) {
      throw new Error((caller || "PlayerNhlStatsUpdater") + " requires a seasonId");
    }
    return seasonKey;
  }

  function toNumber(value) {
    if (value === undefined || value === null || value === "") return 0;
    var text = String(value)
      .replace(/,/g, "")
      .replace(/\u2212/g, "-")
      .trim();
    if (!text) return 0;
    if (text.charAt(0) === ".") text = "0" + text;
    if (text.indexOf("-.") === 0) text = text.replace("-.", "-0.");
    var numeric = Number(text);
    return isFinite(numeric) ? numeric : 0;
  }

  function toStatNumberOrBlank(value) {
    if (value === undefined || value === null || value === "") return "";
    var text = String(value)
      .replace(/,/g, "")
      .replace(/\u2212/g, "-")
      .trim();
    if (!text) return "";
    if (text.charAt(0) === ".") text = "0" + text;
    if (text.indexOf("-.") === 0) text = text.replace("-.", "-0.");
    var numeric = Number(text);
    return isFinite(numeric) ? numeric : "";
  }

  function parseTimeToMinutes(value) {
    var text = String(value || "").trim();
    if (!text) return "";
    var parts = text.split(":");
    if (parts.length !== 2) return toStatNumberOrBlank(text);
    var minutes = Number(parts[0]);
    var seconds = Number(parts[1]);
    if (!isFinite(minutes) || !isFinite(seconds)) return "";
    return Math.round((minutes + seconds / 60) * 100) / 100;
  }

  function cleanWhitespace(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function decodeHtmlEntities(value) {
    return String(value || "")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&apos;|&#39;|&#x27;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#(\d+);/g, function (_m, code) {
        var num = Number(code);
        return isFinite(num) ? String.fromCharCode(num) : "";
      });
  }

  function stripTags(value) {
    return cleanWhitespace(
      decodeHtmlEntities(String(value || "").replace(/<[^>]*>/g, " ")),
    );
  }

  function normalizeName(value) {
    var helper =
      typeof GshlUtils !== "undefined" &&
      GshlUtils.core &&
      GshlUtils.core.text &&
      typeof GshlUtils.core.text.normalizeName === "function"
        ? GshlUtils.core.text.normalizeName
        : null;
    if (helper) return helper(value);
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .trim();
  }

  function tokenizeName(value) {
    var cleaned = cleanWhitespace(
      decodeHtmlEntities(String(value || ""))
        .replace(/[.'’\-]/g, " ")
        .replace(/[^A-Za-z\s]/g, " "),
    ).toLowerCase();
    if (!cleaned) return [];
    return cleaned.split(/\s+/).filter(Boolean);
  }

  function trimSuffixTokens(tokens) {
    var suffixes = {
      jr: true,
      sr: true,
      ii: true,
      iii: true,
      iv: true,
      v: true,
    };
    var out = (tokens || []).slice();
    while (out.length && suffixes[out[out.length - 1]]) {
      out.pop();
    }
    return out;
  }

  function buildNameKeys(value) {
    var raw = String(value || "").trim();
    if (!raw) return [];
    var keys = [];
    var seen = {};

    function pushKey(key) {
      var normalized = normalizeName(key);
      if (!normalized || seen[normalized]) return;
      seen[normalized] = true;
      keys.push(normalized);
    }

    var tokens = tokenizeName(raw);
    var trimmed = trimSuffixTokens(tokens);
    pushKey(raw);
    if (trimmed.length) {
      pushKey(trimmed.join(" "));
    }
    if (trimmed.length >= 2) {
      pushKey(trimmed[0] + " " + trimmed[trimmed.length - 1]);
    }
    return keys;
  }

  function normalizeTeamAbbr(value) {
    var raw = String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .trim();
    if (!raw) return "";
    return NHL_TEAM_ALIASES[raw] || raw;
  }

  function isAggregateTeamAbbr(value) {
    var team = normalizeTeamAbbr(value);
    return team === "TOT" || /^\d+TM$/.test(team);
  }

  function normalizePosToken(value) {
    var raw = String(value || "")
      .toUpperCase()
      .replace(/[^A-Z+]/g, "")
      .trim();
    if (!raw) return "";
    if (raw === "LEFTWING" || raw === "LW") return "LW";
    if (raw === "RIGHTWING" || raw === "RW") return "RW";
    if (raw === "CENTER" || raw === "C") return "C";
    if (raw === "DEFENSE" || raw === "DEFENCE" || raw === "D") return "D";
    if (raw === "GOALIE" || raw === "GOALTENDER" || raw === "G") return "G";
    return raw;
  }

  function splitPosTokens(value) {
    if (Array.isArray(value)) {
      return value
        .map(normalizePosToken)
        .filter(Boolean);
    }
    return String(value || "")
      .split(/[,\//|]/)
      .map(normalizePosToken)
      .filter(Boolean);
  }

  function inferPosGroup(posTokens, fallback) {
    var tokens = splitPosTokens(posTokens);
    if (tokens.indexOf("G") >= 0 || normalizePosToken(fallback) === "G") return "G";
    if (tokens.indexOf("D") >= 0 || normalizePosToken(fallback) === "D") return "D";
    return "F";
  }

  function buildPlayerFullName(player) {
    var fullName = cleanWhitespace(player && player.fullName);
    if (fullName) return fullName;
    return cleanWhitespace((player && player.firstName) + " " + (player && player.lastName));
  }

  function fetchSeasonRecord(seasonId) {
    var seasons = GshlUtils.sheets.read.fetchSheetAsObjects(SPREADSHEET_ID, "Season", {
      coerceTypes: true,
    });
    for (var i = 0; i < seasons.length; i++) {
      if (String(seasons[i] && seasons[i].id) === String(seasonId)) return seasons[i];
    }
    return null;
  }

  function parseEndingSeasonYearFromName(name) {
    var text = String(name || "").trim();
    if (!text) return "";
    var match = text.match(/(\d{4})\s*-\s*(\d{2,4})/);
    if (!match) return "";
    var startYear = Number(match[1]);
    var endPart = match[2];
    if (!isFinite(startYear)) return "";
    if (endPart.length === 2) {
      var century = String(startYear).slice(0, 2);
      return Number(century + endPart);
    }
    return Number(endPart);
  }

  function resolveSeasonYear(seasonId, options) {
    var opts = options || {};
    if (opts.year !== undefined && opts.year !== null && opts.year !== "") {
      return String(opts.year).trim();
    }
    var season = fetchSeasonRecord(seasonId);
    if (season && season.year !== undefined && season.year !== null && season.year !== "") {
      return String(season.year).trim();
    }
    var parsedFromName = parseEndingSeasonYearFromName(season && season.name);
    if (parsedFromName) return String(parsedFromName);
    if (season && season.endDate) {
      var endDate = new Date(season.endDate);
      if (!isNaN(endDate.getTime())) return String(endDate.getUTCFullYear());
    }
    var seasonNumber = Number(seasonId);
    if (isFinite(seasonNumber) && seasonNumber > 0) {
      return String(2014 + seasonNumber);
    }
    throw new Error(
      "[PlayerNhlStatsUpdater] Could not resolve Hockey Reference season year for seasonId=" +
        seasonId,
    );
  }

  function buildSourceUrl(kind, seasonYear) {
    return (
      "https://www.hockey-reference.com/leagues/NHL_" +
      String(seasonYear).trim() +
      "_" +
      kind +
      ".html"
    );
  }

  function isRetryableFetchFailure(code, html) {
    if (code === 429) return true;
    if (code >= 500 && code < 600) return true;
    var excerpt = String(html || "");
    return /error code:\s*1015/i.test(excerpt) || /rate limited/i.test(excerpt);
  }

  function fetchHtml(url) {
    if (Object.prototype.hasOwnProperty.call(htmlCacheByUrl, url)) {
      return htmlCacheByUrl[url];
    }

    var lastCode = 0;
    var lastHtml = "";
    for (var attempt = 0; attempt <= FETCH_RETRY_DELAYS_MS.length; attempt++) {
      var response = UrlFetchApp.fetch(url, {
        method: "get",
        followRedirects: true,
        muteHttpExceptions: true,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; GSHL-AppsScript/1.0; +https://www.hockey-reference.com/)",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://www.hockey-reference.com/",
        },
      });
      var code = response.getResponseCode();
      var html = response.getContentText();
      lastCode = code;
      lastHtml = html;

      if (code >= 200 && code < 300) {
        htmlCacheByUrl[url] = html;
        return html;
      }

      if (attempt < FETCH_RETRY_DELAYS_MS.length && isRetryableFetchFailure(code, html)) {
        Utilities.sleep(FETCH_RETRY_DELAYS_MS[attempt]);
        continue;
      }

      break;
    }

    var excerpt = String(lastHtml || "").slice(0, 500);
    var rateLimitHint =
      lastCode === 429 || /error code:\s*1015/i.test(excerpt)
        ? " Hockey Reference is rate limiting this script. Wait a few minutes and retry fewer seasons per run."
        : "";
    throw new Error(
      "[PlayerNhlStatsUpdater] Hockey Reference request failed HTTP " +
        lastCode +
        " for " +
        url +
        " excerpt=" +
        excerpt +
        rateLimitHint,
    );
  }

  function extractTableBody(html, tableId) {
    var pattern =
      "<table[^>]*id=[\"']" +
      tableId +
      "[\"'][\\s\\S]*?<tbody>([\\s\\S]*?)<\\/tbody>";
    var match = String(html || "").match(new RegExp(pattern, "i"));
    if (!match) {
      throw new Error(
        "[PlayerNhlStatsUpdater] Could not find table body for tableId=" + tableId,
      );
    }
    return match[1];
  }

  function parseTableRows(bodyHtml) {
    var rows = [];
    var rowIndex = 0;
    String(bodyHtml || "").replace(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi, function (_m, attrs, inner) {
      if (/class=["'][^"']*\bthead\b/i.test(attrs || "")) return "";
      var row = {};
      row.__sourceIndex = rowIndex++;
      String(inner || "").replace(
        /<(td|th)\b[^>]*data-stat=["']([^"']+)["'][^>]*>([\s\S]*?)<\/\1>/gi,
        function (_cellMatch, _tag, dataStat, cellHtml) {
          row[dataStat] = stripTags(cellHtml);
          return "";
        },
      );
      if (row.name_display) {
        rows.push(row);
      }
      return "";
    });
    return rows;
  }

  function buildSkaterCandidate(row) {
    var goals = toStatNumberOrBlank(row.goals);
    var assists = toStatNumberOrBlank(row.assists);
    var powerPlayGoals = toNumber(row.goals_pp);
    var powerPlayAssists = toNumber(row.assists_pp);
    var rawPos = cleanWhitespace(row.pos);
    var nhlPos = splitPosTokens(rawPos).join(",");
    return {
      sourceType: "skater",
      fullName: cleanWhitespace(row.name_display),
      normalizedName: normalizeName(row.name_display),
      nhlTeam: cleanWhitespace(row.team_name_abbr),
      rawPos: rawPos,
      nhlPos: nhlPos || rawPos,
      primaryPos: splitPosTokens(rawPos)[0] || "",
      posGroup: inferPosGroup(rawPos, rawPos),
      age: toStatNumberOrBlank(row.age),
      GP: toStatNumberOrBlank(row.games),
      G: goals,
      A: assists,
      P: toStatNumberOrBlank(row.points),
      PM: toStatNumberOrBlank(row.plus_minus),
      PIM: toStatNumberOrBlank(row.pen_min),
      PPP:
        powerPlayGoals || powerPlayAssists
          ? Math.round((powerPlayGoals + powerPlayAssists) * 100) / 100
          : "",
      SOG: toStatNumberOrBlank(row.shots),
      HIT: toStatNumberOrBlank(row.hits),
      BLK: toStatNumberOrBlank(row.blocks),
      W: "",
      GA: "",
      GAA: "",
      SV: "",
      SA: "",
      SVP: "",
      SO: "",
      QS: "",
      RBS: "",
      TOI: parseTimeToMinutes(row.time_on_ice),
      sourceIndex: toNumber(row.__sourceIndex),
    };
  }

  function buildGoalieCandidate(row) {
    var rawPos = cleanWhitespace(row.pos || "G");
    return {
      sourceType: "goalie",
      fullName: cleanWhitespace(row.name_display),
      normalizedName: normalizeName(row.name_display),
      nhlTeam: cleanWhitespace(row.team_name_abbr),
      rawPos: rawPos,
      nhlPos: "G",
      primaryPos: "G",
      posGroup: "G",
      age: toStatNumberOrBlank(row.age),
      GP: toStatNumberOrBlank(row.goalie_games),
      G: "",
      A: "",
      P: "",
      PM: "",
      PIM: "",
      PPP: "",
      SOG: "",
      HIT: "",
      BLK: "",
      W: toStatNumberOrBlank(row.goalie_wins),
      GA: toStatNumberOrBlank(row.goalie_goals_against),
      GAA: toStatNumberOrBlank(row.goals_against_avg),
      SV: toStatNumberOrBlank(row.goalie_saves),
      SA: toStatNumberOrBlank(row.shots_against_goalie),
      SVP: toStatNumberOrBlank(row.save_pct_goalie),
      SO: toStatNumberOrBlank(row.goalie_shutouts),
      QS: toStatNumberOrBlank(row.quality_starts),
      RBS: toStatNumberOrBlank(row.goalie_really_bad_starts),
      TOI: parseTimeToMinutes(row.goalie_min),
      sourceIndex: toNumber(row.__sourceIndex),
    };
  }

  function fetchHockeyReferenceCandidates(seasonYear) {
    var skaterUrl = buildSourceUrl("skaters", seasonYear);
    var goalieUrl = buildSourceUrl("goalies", seasonYear);
    var skaterRows = parseTableRows(extractTableBody(fetchHtml(skaterUrl), "player_stats"));
    Utilities.sleep(FETCH_DELAY_BETWEEN_SOURCE_PAGES_MS);
    var goalieRows = parseTableRows(extractTableBody(fetchHtml(goalieUrl), "goalie_stats"));
    return {
      skaterUrl: skaterUrl,
      goalieUrl: goalieUrl,
      skaters: skaterRows.map(buildSkaterCandidate),
      goalies: goalieRows.map(buildGoalieCandidate),
    };
  }

  function detectPlayerNhlSheetName() {
    var candidates = ["PlayerNHL", "PlayerNHLStatLine", "PlayerNhl", "PlayerNhlStatLine"];
    for (var i = 0; i < candidates.length; i++) {
      try {
        GshlUtils.sheets.read.fetchSheetAsObjects(PLAYERSTATS_SPREADSHEET_ID, candidates[i], {
          coerceTypes: true,
        });
        return candidates[i];
      } catch (_e) {
        // try next
      }
    }
    return "PlayerNHLStatLine";
  }

  function buildPlayersByName() {
    var players = GshlUtils.sheets.read.fetchSheetAsObjects(SPREADSHEET_ID, "Player", {
      coerceTypes: true,
    });
    var map = {};
    players.forEach(function (player) {
      if (!player || player.id === undefined || player.id === null || player.id === "") return;
      buildNameKeys(buildPlayerFullName(player)).forEach(function (key) {
        if (!map[key]) map[key] = [];
        if (
          map[key].some(function (existing) {
            return String(existing && existing.id) === String(player && player.id);
          })
        ) {
          return;
        }
        map[key].push(player);
      });
    });
    return map;
  }

  function getAllPlayers() {
    return GshlUtils.sheets.read.fetchSheetAsObjects(SPREADSHEET_ID, "Player", {
      coerceTypes: true,
    });
  }

  function getPlayersForCandidate(playersByName, candidate) {
    var results = [];
    var seen = {};
    buildNameKeys(candidate && candidate.fullName).forEach(function (key) {
      (playersByName[key] || []).forEach(function (player) {
        var playerId = String(player && player.id);
        if (!playerId || seen[playerId]) return;
        seen[playerId] = true;
        results.push(player);
      });
    });
    return results;
  }

  function getComparableNameParts(value) {
    var tokens = trimSuffixTokens(tokenizeName(value));
    if (!tokens.length) {
      return {
        first: "",
        last: "",
        joined: "",
      };
    }
    return {
      first: tokens[0] || "",
      last: tokens[tokens.length - 1] || "",
      joined: tokens.join(" "),
    };
  }

  function isNamePrefixMatch(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.charAt(0) === b.charAt(0) && (a.length >= 3 || b.length >= 3)) {
      return a.indexOf(b) === 0 || b.indexOf(a) === 0;
    }
    return false;
  }

  function findFallbackPlayersForCandidate(candidate, allPlayers) {
    if (!candidate || !allPlayers || !allPlayers.length) return [];

    var candidateTeam = normalizeTeamAbbr(candidate.nhlTeam);
    var candidateName = getComparableNameParts(candidate.fullName);
    var candidatePosGroup = candidate.posGroup || inferPosGroup(candidate.nhlPos, candidate.rawPos);

    if (!candidateName.last) return [];

    return allPlayers.filter(function (player) {
      if (!player || !player.id) return false;

      var playerPosGroup = inferPosGroup(player && player.nhlPos, player && player.posGroup);
      if (candidatePosGroup && playerPosGroup !== candidatePosGroup) return false;

      var playerName = getComparableNameParts(buildPlayerFullName(player));
      if (!playerName.last || playerName.last !== candidateName.last) return false;

      if (!isNamePrefixMatch(playerName.first, candidateName.first)) return false;

      var playerTeam = normalizeTeamAbbr(player && player.nhlTeam);
      if (candidateTeam && playerTeam && candidateTeam !== playerTeam) return false;

      return true;
    });
  }

  function getPlayerPosTokens(player) {
    return splitPosTokens(player && player.nhlPos);
  }

  function scorePlayerForCandidate(player, candidate) {
    var score = 0;
    var playerTeam = normalizeTeamAbbr(player && player.nhlTeam);
    var candidateTeam = normalizeTeamAbbr(candidate && candidate.nhlTeam);
    var playerPosGroup = inferPosGroup(player && player.nhlPos, player && player.posGroup);
    var playerPosTokens = getPlayerPosTokens(player);
    if (playerPosGroup && candidate && playerPosGroup === candidate.posGroup) score += 4;
    if (candidate && candidate.primaryPos && playerPosTokens.indexOf(candidate.primaryPos) >= 0) {
      score += 2;
    }
    if (playerTeam && candidateTeam && playerTeam === candidateTeam) {
      score += 5;
    } else if (isAggregateTeamAbbr(candidateTeam)) {
      score += 2;
    }
    if (
      player &&
      player.age !== undefined &&
      player.age !== null &&
      player.age !== "" &&
      candidate &&
      candidate.age !== "" &&
      Number(player.age) === Number(candidate.age)
    ) {
      score += 1;
    }
    return score;
  }

  function choosePreferredCandidateForPlayer(player, candidates) {
    if (!candidates || !candidates.length) return null;
    var sorted = candidates.slice().sort(function (a, b) {
      var sourceDiff = toNumber(a && a.sourceIndex) - toNumber(b && b.sourceIndex);
      if (sourceDiff) return sourceDiff;
      var scoreDiff = scorePlayerForCandidate(player, b) - scorePlayerForCandidate(player, a);
      if (scoreDiff) return scoreDiff;
      var aggregateDiff =
        (isAggregateTeamAbbr(b && b.nhlTeam) ? 1 : 0) -
        (isAggregateTeamAbbr(a && a.nhlTeam) ? 1 : 0);
      if (aggregateDiff) return aggregateDiff;
      return toNumber(b && b.GP) - toNumber(a && a.GP);
    });
    return sorted[0];
  }

  function choosePlayerForCandidates(players, candidates) {
    if (!players || !players.length || !candidates || !candidates.length) return null;
    if (players.length === 1) return players[0];
    var ranked = players
      .map(function (player) {
        return {
          player: player,
          score: scorePlayerForCandidate(player, choosePreferredCandidateForPlayer(player, candidates)),
        };
      })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        if (!!(b.player && b.isActive) !== !!(a.player && a.isActive)) {
          return b.player && b.isActive ? 1 : -1;
        }
        return String(a.player && a.player.id).localeCompare(String(b.player && b.player.id));
      });
    if (!ranked.length) return null;
    if (ranked[0].score <= 0) return null;
    return ranked[0].player;
  }

  function buildUpdateRow(seasonId, player, candidate) {
    var storedTeam = cleanWhitespace(candidate && candidate.nhlTeam);
    if (isAggregateTeamAbbr(storedTeam)) {
      storedTeam = cleanWhitespace((player && player.nhlTeam) || storedTeam);
    }
    return {
      seasonId: String(seasonId),
      playerId: String(player && player.id),
      nhlPos: candidate.nhlPos || cleanWhitespace(player && player.nhlPos),
      posGroup: candidate.posGroup || inferPosGroup(player && player.nhlPos, player && player.posGroup),
      nhlTeam: storedTeam,
      age: candidate.age,
      GP: candidate.GP,
      G: candidate.G,
      A: candidate.A,
      P: candidate.P,
      PM: candidate.PM,
      PIM: candidate.PIM,
      PPP: candidate.PPP,
      SOG: candidate.SOG,
      HIT: candidate.HIT,
      BLK: candidate.BLK,
      W: candidate.W,
      GA: candidate.GA,
      GAA: candidate.GAA,
      SV: candidate.SV,
      SA: candidate.SA,
      SVP: candidate.SVP,
      SO: candidate.SO,
      QS: candidate.QS,
      RBS: candidate.RBS,
      TOI: candidate.TOI,
    };
  }

  ns.updateSeasonStats = function updateSeasonStats(seasonId, options) {
    var seasonKey = requireSeasonId(seasonId, "updateSeasonStats");
    var opts = Object.assign(
      {
        dryRun: false,
        logToConsole: true,
      },
      options || {},
    );
    var logToConsole = !!opts.logToConsole;
    var dryRun = !!opts.dryRun;
    var seasonYear = resolveSeasonYear(seasonKey, opts);
    var source = fetchHockeyReferenceCandidates(seasonYear);
    var sheetName = detectPlayerNhlSheetName();
    var playersByName = buildPlayersByName();
    var allPlayers = getAllPlayers();
    var groupedCandidates = {};
    var updates = [];
    var unmatchedNames = [];
    var ambiguousNames = [];
    var matchedSkaters = 0;
    var matchedGoalies = 0;
    var unmatchedGoalies = [];
    var ambiguousGoalies = [];

    source.skaters.concat(source.goalies).forEach(function (candidate) {
      if (!candidate || !candidate.normalizedName) return;
      if (!groupedCandidates[candidate.normalizedName]) groupedCandidates[candidate.normalizedName] = [];
      groupedCandidates[candidate.normalizedName].push(candidate);
    });

    Object.keys(groupedCandidates).forEach(function (nameKey) {
      var candidates = groupedCandidates[nameKey];
      var players = getPlayersForCandidate(playersByName, candidates[0]);
      if (!players.length) {
        players = findFallbackPlayersForCandidate(candidates[0], allPlayers);
      }
      if (!players.length) {
        unmatchedNames.push(candidates[0] && candidates[0].fullName);
        if (candidates[0] && candidates[0].sourceType === "goalie") {
          unmatchedGoalies.push(candidates[0] && candidates[0].fullName);
        }
        return;
      }

      var player = choosePlayerForCandidates(players, candidates);
      if (!player && candidates[0] && candidates[0].sourceType === "goalie") {
        var fallbackGoaliePlayers = findFallbackPlayersForCandidate(candidates[0], allPlayers);
        if (fallbackGoaliePlayers.length) {
          player = choosePlayerForCandidates(fallbackGoaliePlayers, candidates);
        }
      }
      if (!player) {
        ambiguousNames.push(candidates[0] && candidates[0].fullName);
        if (candidates[0] && candidates[0].sourceType === "goalie") {
          ambiguousGoalies.push(candidates[0] && candidates[0].fullName);
        }
        return;
      }

      var candidate = choosePreferredCandidateForPlayer(player, candidates);
      if (!candidate) {
        ambiguousNames.push(candidates[0] && candidates[0].fullName);
        if (candidates[0] && candidates[0].sourceType === "goalie") {
          ambiguousGoalies.push(candidates[0] && candidates[0].fullName);
        }
        return;
      }

      if (candidate.sourceType === "goalie") matchedGoalies++;
      else matchedSkaters++;
      updates.push(buildUpdateRow(seasonKey, player, candidate));
    });

    if (logToConsole) {
      console.log(
        "[PlayerNhlStatsUpdater] season=" +
          seasonKey +
          " hrYear=" +
          seasonYear +
          " sheet=" +
          sheetName +
          " skaters=" +
          source.skaters.length +
          " goalies=" +
          source.goalies.length +
          " matched=" +
          updates.length +
          " matchedSkaters=" +
          matchedSkaters +
          " matchedGoalies=" +
          matchedGoalies +
          " unmatchedNames=" +
          unmatchedNames.length +
          " ambiguousNames=" +
          ambiguousNames.length,
      );
      if (unmatchedNames.length) {
        console.log(
          "[PlayerNhlStatsUpdater] Unmatched sample: " +
            unmatchedNames.slice(0, 10).join(", "),
        );
      }
      if (ambiguousNames.length) {
        console.log(
          "[PlayerNhlStatsUpdater] Ambiguous sample: " +
            ambiguousNames.slice(0, 10).join(", "),
        );
      }
      if (unmatchedGoalies.length) {
        console.log(
          "[PlayerNhlStatsUpdater] Unmatched goalie sample: " +
            unmatchedGoalies.slice(0, 10).join(", "),
        );
      }
      if (ambiguousGoalies.length) {
        console.log(
          "[PlayerNhlStatsUpdater] Ambiguous goalie sample: " +
            ambiguousGoalies.slice(0, 10).join(", "),
        );
      }
    }

    if (dryRun) {
      return {
        dryRun: true,
        seasonId: seasonKey,
        seasonYear: seasonYear,
        sheetName: sheetName,
        matched: updates.length,
        matchedSkaters: matchedSkaters,
        matchedGoalies: matchedGoalies,
        unmatchedNames: unmatchedNames.length,
        ambiguousNames: ambiguousNames.length,
      };
    }

    var result = GshlUtils.sheets.write.upsertSheetByKeys(
      PLAYERSTATS_SPREADSHEET_ID,
      sheetName,
      ["playerId", "seasonId"],
      updates,
      {
        merge: true,
        updatedAtColumn: "updatedAt",
      },
    );

    return {
      dryRun: false,
      seasonId: seasonKey,
      seasonYear: seasonYear,
      sheetName: sheetName,
      matched: updates.length,
      matchedSkaters: matchedSkaters,
      matchedGoalies: matchedGoalies,
      unmatchedNames: unmatchedNames.length,
      ambiguousNames: ambiguousNames.length,
      updated: result && result.updated ? result.updated : 0,
      inserted: result && result.inserted ? result.inserted : 0,
      total: result && result.total ? result.total : updates.length,
    };
  };

  return ns;
})();

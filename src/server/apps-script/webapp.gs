/**
 * GSHL Web App Interface
 * Provides HTTP endpoints to trigger aggregation functions
 */

/**
 * Handle GET requests - serves a simple web interface
 */
function doGet(e) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>GSHL Data Aggregation</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 1000px; margin: 50px auto; padding: 20px; }
        .function-group { margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
        button { padding: 10px 20px; margin: 5px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #3367d6; }
        .success { color: green; }
        .error { color: red; }
        .loading { color: #ff9800; }
        #output { margin-top: 20px; padding: 10px; background: #f5f5f5; border-radius: 4px; white-space: pre-wrap; }
        input[type="text"] { padding: 8px; width: 260px; }
      </style>
    </head>
    <body>
      <h1>🏒 GSHL Data Aggregation Control Panel</h1>
      
      <div class="function-group">
        <h3>Individual Functions</h3>
        <button onclick="runFunction('aggregateTeamWeeks')">Aggregate Team Weeks</button>
        <button onclick="runFunction('aggregateTeamSeasons')">Aggregate Team Seasons</button>
        <button onclick="runFunction('aggregatePlayerWeeks')">Aggregate Player Weeks</button>
        <button onclick="runFunction('initializeWorkbooks')">Initialize Workbooks</button>
      </div>

      <div class="function-group">
        <h3>Ratings - Players</h3>
        <button onclick="runFunction('ratings_nhl_recalculateAll')">Recalc NHL Player Season</button>
        <button onclick="runFunction('ratings_week_recalculateAll')">Recalc Player Weeks</button>
        <button onclick="runFunction('ratings_totals_recalculateAll')">Recalc Player Season Totals</button>
        <button onclick="runFunction('ratings_splits_recalculateAll')">Recalc Player Season Splits</button>
        <button onclick="runFunction('ratings_recalculate_all_players')" style="background:#34a853;">Recalc All Players</button>
      </div>

      <div class="function-group">
        <h3>Ratings - Teams</h3>
        <button onclick="runFunction('ratings_team_day_recalculateAll')">Recalc Team Day</button>
        <button onclick="runFunction('ratings_team_week_recalculateAll')">Recalc Team Week</button>
        <button onclick="runFunction('ratings_team_season_recalculateAll')">Recalc Team Season</button>
        <button onclick="runFunction('ratings_recalculate_all_teams')" style="background:#34a853;">Recalc All Teams</button>
      </div>

      <div class="function-group">
        <h3>Ratings - By Key</h3>
        <div>
          <input id="ratingsKey" type="text" placeholder="e.g., nhl-player-season | player-week | team-season" />
          <button onclick="runRatingsByKey()">Run</button>
        </div>
        <small>Known keys: nhl-player-season, player-week, player-season-totals, player-season-splits, team-day, team-week, team-season</small>
      </div>
      
      <div class="function-group">
        <h3>Pipeline Functions</h3>
        <button onclick="runFunction('runFullAggregation')" style="background: #34a853;">Run Full Aggregation Pipeline</button>
      </div>
      
      <div id="output">Ready to run functions...</div>
      
      <script>
        function runFunction(functionName) {
          const output = document.getElementById('output');
          output.innerHTML = '<span class="loading">🔄 Running ' + functionName + '...</span>';
          google.script.run
            .withSuccessHandler(function(result) {
              output.innerHTML = '<span class="success">✅ ' + functionName + ' completed!</span>\n' + JSON.stringify(result, null, 2);
            })
            .withFailureHandler(function(error) {
              output.innerHTML = '<span class="error">❌ ' + functionName + ' failed:</span>\n' + error.toString();
            })
            .runServerFunction(functionName); // use server-side dispatcher
        }
        function runRatingsByKey(){
          const output = document.getElementById('output');
          const key = document.getElementById('ratingsKey').value;
          if(!key){ output.innerHTML = '<span class="error">Please enter a key</span>'; return; }
          output.innerHTML = '<span class="loading">🔄 Running ratings_recalculateAllByKey("' + key + '")...</span>';
          google.script.run
            .withSuccessHandler(function(result){
              output.innerHTML = '<span class="success">✅ ratings_recalculateAllByKey completed!</span>\n' + JSON.stringify(result, null, 2);
            })
            .withFailureHandler(function(error){
              output.innerHTML = '<span class="error">❌ ratings_recalculateAllByKey failed:</span>\n' + error.toString();
            })
            .ratings_recalculateAllByKey(key);
        }
      </script>
    </body>
    </html>
  `;

  return HtmlService.createHtmlOutput(html)
    .setTitle("GSHL Data Aggregation")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Server-side dispatcher to invoke known functions by name
function runServerFunction(functionName) {
  switch (String(functionName || "").trim()) {
    case "aggregateTeamWeeks":
      return aggregateTeamWeeks();
    case "aggregateTeamSeasons":
      return aggregateTeamSeasons();
    case "aggregatePlayerWeeks":
      return aggregatePlayerWeeks();
    case "initializeWorkbooks":
      return initializeWorkbooks();

    // Ratings players
    case "ratings_nhl_recalculateAll":
      return ratings_nhl_recalculateAll();
    case "ratings_week_recalculateAll":
      return ratings_week_recalculateAll();
    case "ratings_totals_recalculateAll":
      return ratings_totals_recalculateAll();
    case "ratings_splits_recalculateAll":
      return ratings_splits_recalculateAll();
    case "ratings_recalculate_all_players":
      return ratings_recalculate_all_players();

    // Ratings teams
    case "ratings_team_day_recalculateAll":
      return ratings_team_day_recalculateAll();
    case "ratings_team_week_recalculateAll":
      return ratings_team_week_recalculateAll();
    case "ratings_team_season_recalculateAll":
      return ratings_team_season_recalculateAll();
    case "ratings_recalculate_all_teams":
      return ratings_recalculate_all_teams();

    case "runFullAggregation":
      return runFullAggregation();

    default:
      throw new Error("Unknown function: " + functionName);
  }
}

/**
 * Handle POST requests - API endpoints for external calls
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const functionName = data.function;

    let result;
    switch (functionName) {
      case "aggregateTeamWeeks":
        result = aggregateTeamWeeks();
        break;
      case "aggregateTeamSeasons":
        result = aggregateTeamSeasons();
        break;
      case "aggregatePlayerWeeks":
        result = aggregatePlayerWeeks();
        break;
      case "runFullAggregation":
        result = runFullAggregation();
        break;
      case "initializeWorkbooks":
        result = initializeWorkbooks();
        break;
      case "ratingsRecalcByKey":
        result = ratings_recalculateAllByKey(data.key);
        break;
      default:
        throw new Error(`Unknown function: ${functionName}`);
    }

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
      ContentService.MimeType.JSON,
    );
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

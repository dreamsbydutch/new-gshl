import assert from "node:assert/strict";
import test from "node:test";

import { parseYahooFantasyXml } from "./xml";

void test("parseYahooFantasyXml parses metadata attributes and payload structure", () => {
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<fantasy_content time="42.1ms" xml:lang="en-US" yahoo:uri="http://fantasysports.yahooapis.com/sample">
  <league>
    <league_key>123.l.456</league_key>
    <league_id>456</league_id>
    <name>Sample League</name>
    <url>https://fantasysports.yahoo.com/hockey/123/456</url>
    <standings>
      <teams count="1">
        <team>
          <team_key>123.l.456.t.1</team_key>
          <team_id>1</team_id>
          <name>Team Alpha</name>
        </team>
      </teams>
    </standings>
  </league>
</fantasy_content>`;

  const result = parseYahooFantasyXml(sampleXml);

  assert.equal(result.meta?.time, "42.1ms");
  assert.equal(result.meta?.language, "en-US");
  assert.equal(
    result.meta?.yahooUri,
    "http://fantasysports.yahooapis.com/sample",
  );

  const league = (result.payload as { league: Record<string, unknown> }).league;

  assert.equal(league?.league_key, "123.l.456");
  assert.equal(league?.league_id, "456");
  assert.equal(league?.name, "Sample League");

  const standings = league?.standings as Record<string, unknown>;
  const teams = standings?.teams as Record<string, unknown>;
  assert.equal(teams?.count, "1");
  const team = (teams?.team as Record<string, unknown>) ?? {};
  assert.equal(team?.team_key, "123.l.456.t.1");
  assert.equal(team?.team_id, "1");
});

/**
 * @fileoverview Yahoo Scraper Tester Component
 *
 * Minimal client widget to trigger Yahoo roster scrapes from the UI and inspect results.
 * Admin tool for testing and debugging Yahoo roster API integration.
 *
 * @module components/admin/YahooScraperTester
 */

"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { format } from "date-fns";
import { api } from "src/trpc/react";
import type { RouterOutputs } from "src/trpc/react";
import { Button, Input, Label, Select } from "@gshl-ui";

const DEFAULT_DATE = format(new Date(), "yyyy-MM-dd");

type YahooScrapeResult = RouterOutputs["yahooScraper"]["scrapeTeam"];

/**
 * YahooScraperTester Component
 *
 * Interactive admin tool for testing Yahoo roster scraping functionality.
 * Allows triggering single-team roster scrapes and inspecting results.
 *
 * **Component Responsibilities:**
 * - Render team selection dropdown (filtered to teams with Yahoo API IDs)
 * - Provide date picker for target scrape date
 * - Trigger scrape mutation via tRPC
 * - Display scrape results with player roster details
 * - Show error messages for failed scrapes
 *
 * **Data Flow:**
 * - Uses tRPC mutation `yahooScraper.scrapeTeam` directly
 * - No custom hook needed (simple mutation pattern per architecture)
 * - Component handles: form state, mutation triggering, result display
 *
 * @param teamOptions - Franchises available for scraping along with Yahoo IDs
 * @returns Interactive scraper testing interface
 *
 * @example
 * ```tsx
 * <YahooScraperTester teamOptions={franchises} />
 * ```
 */
export function YahooScraperTester({
  teamOptions,
}: {
  teamOptions: Array<{ id: string; name: string; yahooApiId: string | null }>;
}) {
  const teamsWithYahooId = useMemo(
    () => teamOptions.filter((team) => !!team.yahooApiId),
    [teamOptions],
  );

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    teamsWithYahooId[0]?.yahooApiId ?? null,
  );
  const [targetDate, setTargetDate] = useState(DEFAULT_DATE);
  const [results, setResults] = useState<YahooScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrapeMutation = api.yahooScraper.scrapeTeam.useMutation({
    onSuccess: (data) => {
      setResults(data);
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
      setResults(null);
    },
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTeamId) {
      setError("Select a franchise with a Yahoo API ID");
      return;
    }
    await scrapeMutation.mutateAsync({
      teamId: selectedTeamId,
      targetDate,
    });
  };

  const isLoading = scrapeMutation.isPending;
  const hasTeams = teamsWithYahooId.length > 0;

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 shadow">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Yahoo Roster Scraper</h2>
        <p className="text-sm text-muted-foreground">
          Trigger a single-team roster scrape using live Yahoo data.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="col-span-2 grid gap-2 sm:col-span-1">
          <Label htmlFor="team">Yahoo Team</Label>
          <Select
            id="team"
            value={selectedTeamId ?? ""}
            onValueChange={(value) => setSelectedTeamId(value || null)}
            disabled={!hasTeams}
          >
            <option value="" disabled>
              Choose a team
            </option>
            {teamsWithYahooId.map((team) => (
              <option key={team.id} value={team.yahooApiId ?? ""}>
                {team.name ?? team.id}
              </option>
            ))}
          </Select>
        </div>

        <div className="col-span-2 grid gap-2 sm:col-span-1">
          <Label htmlFor="date">Target Date</Label>
          <Input
            id="date"
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
            max={DEFAULT_DATE}
          />
        </div>

        <div className="col-span-2 flex items-center gap-3">
          <Button type="submit" disabled={isLoading || !hasTeams}>
            {isLoading ? "Scraping…" : "Scrape Team"}
          </Button>
          {isLoading && (
            <span className="text-sm text-muted-foreground">
              Fetching roster…
            </span>
          )}
          {!hasTeams && (
            <span className="text-sm text-muted-foreground">
              No franchises have a Yahoo API ID configured.
            </span>
          )}
        </div>
      </form>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {results && (
        <aside className="space-y-3">
          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            {results.franchiseName && (
              <p>
                <strong>GSHL Franchise:</strong> {results.franchiseName}
              </p>
            )}
            {results.seasonName && (
              <p>
                <strong>Season:</strong> {results.seasonName}
              </p>
            )}
            {results.gshlTeamId && (
              <p>
                <strong>GSHL Team ID:</strong> {results.gshlTeamId}
              </p>
            )}
            {!results.gshlTeamId && (
              <p className="text-amber-600">
                <strong>Warning:</strong> No GSHL team mapped for current season
              </p>
            )}
            <p>
              <strong>Players scraped:</strong> {results.playerCount}
            </p>
            <p>
              <strong>Skaters:</strong>{" "}
              {
                results.teamRoster.players.filter(
                  (p) => p.playerType === "skater",
                ).length
              }{" "}
              |<strong> Goalies:</strong>{" "}
              {
                results.teamRoster.players.filter(
                  (p) => p.playerType === "goalie",
                ).length
              }
            </p>
            <p>
              <strong>Team ID:</strong> {results.teamRoster.teamId}
            </p>
            <p>
              <strong>Date:</strong> {targetDate}
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto rounded border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 text-[0.65rem] uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-1">Player</th>
                  <th className="px-2 py-1">Type</th>
                  <th className="px-2 py-1">Pos</th>
                  <th className="px-2 py-1">NHL Team</th>
                  <th className="px-2 py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {results.teamRoster.players.map((player) => {
                  const statusLabel = player.isOnIR
                    ? "IR"
                    : player.isOnIRPlus
                      ? "IR+"
                      : "Active";

                  return (
                    <tr key={player.playerId} className="odd:bg-muted/10">
                      <td className="px-2 py-1 font-medium">
                        {player.playerName}
                      </td>
                      <td className="px-2 py-1">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                            player.playerType === "goalie"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {player.playerType === "goalie" ? "G" : "S"}
                        </span>
                      </td>
                      <td className="px-2 py-1 uppercase">
                        {[player.lineupPosition, ...(player.positions ?? [])]
                          .filter(Boolean)
                          .join(" / ")}
                      </td>
                      <td className="px-2 py-1 uppercase">
                        {player.nhlTeam || "—"}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {statusLabel}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {results.errors && results.errors.length > 0 && (
            <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
              <p className="font-semibold">Errors</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {results.errors.map((err, index) => (
                  <li key={index}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      )}
    </section>
  );
}

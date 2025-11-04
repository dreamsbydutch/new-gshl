import {
  YahooScraperControl,
  LeagueStatsUpdater,
  ServiceAccountInfo,
  SeasonStatsUpdater,
  PlayerWeekAggregator,
} from "@gshl-components/admin";

export default async function Home() {
  return (
    <main className="container mx-auto space-y-6 px-4 py-8">
      <div className="rounded-lg border border-blue-200 bg-card p-6 dark:border-blue-800">
        <ServiceAccountInfo />
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-2xl font-bold">Yahoo Scraper</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Scrape player data from Yahoo Fantasy Hockey
        </p>
        <YahooScraperControl />
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-2xl font-bold">
          Weekly Stats & Matchups Updater
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Aggregate stats for a single week and update matchup scores
        </p>
        <LeagueStatsUpdater />
      </div>

      <div className="rounded-lg border border-purple-200 bg-card p-6 dark:border-purple-800">
        <h2 className="mb-4 text-2xl font-bold text-purple-900 dark:text-purple-100">
          Complete Season Stats Updater
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Process all stats for an entire season: player weeks/splits/totals,
          team days/weeks/seasons, and all matchup scores
        </p>
        <SeasonStatsUpdater />
      </div>

      <div className="rounded-lg border border-green-200 bg-card p-6 dark:border-green-800">
        <h2 className="mb-4 text-2xl font-bold text-green-900 dark:text-green-100">
          Player & Team Stats Aggregator
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Granular control for aggregating player and team stats at multiple
          levels
        </p>
        <PlayerWeekAggregator />
      </div>
    </main>
  );
}

import {
  LeagueActivityCardSkeleton,
  PowerRankingsHomeCardSkeleton,
} from "@gshl-skeletons";

export default function LeagueLoading() {
  return (
    <main
      className="gshl-page"
      aria-label="Loading league overview"
      aria-busy="true"
    >
      <div className="grid gap-x-6 lg:grid-cols-2">
        <LeagueActivityCardSkeleton />
        <PowerRankingsHomeCardSkeleton />
      </div>
    </main>
  );
}

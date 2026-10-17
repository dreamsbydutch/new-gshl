import { Skeleton } from "@gshl-ui";

export default function PlayersLoading() {
  return (
    <main
      className="gshl-page"
      aria-label="Loading player research"
      aria-busy="true"
    >
      <Skeleton className="my-2 h-5 w-36" />
      <div className="grid grid-cols-2 gap-2 py-2 md:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-14" />
        ))}
      </div>
      <Skeleton className="h-11 w-40" />
    </main>
  );
}

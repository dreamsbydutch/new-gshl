export function RouteLoading({ label = "Loading" }: { label?: string }) {
  return (
    <main
      className="mx-auto w-full max-w-4xl space-y-4 px-4 py-8"
      aria-label={label}
      aria-busy="true"
    >
      <div className="h-8 w-2/5 animate-pulse rounded bg-muted" />
      <div className="h-28 animate-pulse rounded-xl bg-muted" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="h-44 animate-pulse rounded-xl bg-muted" />
        <div className="h-44 animate-pulse rounded-xl bg-muted" />
      </div>
    </main>
  );
}

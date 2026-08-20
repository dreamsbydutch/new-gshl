import { Skeleton } from "../ui/SkeletonPrimitive";

function TableRowsSkeleton({
  columns,
  rows = 8,
}: {
  columns: number;
  rows?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[48rem]">
        <div
          className="grid gap-3 bg-slate-50 px-3 py-3"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(4rem, 1fr))`,
          }}
        >
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={index} className="h-3 w-full" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid items-center gap-3 border-t px-3 py-3"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(4rem, 1fr))`,
            }}
          >
            {Array.from({ length: columns }).map((_, cellIndex) => (
              <Skeleton
                key={cellIndex}
                className={cellIndex === 0 ? "h-6 w-6 rounded-md" : "h-3 w-3/4"}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function OwnerRankingsSkeleton() {
  return (
    <div className="mx-auto max-w-[100rem] pb-8">
      <header className="space-y-2 border-b border-slate-200 pb-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-3 w-[38rem] max-w-[90%]" />
      </header>
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <TableRowsSkeleton columns={10} rows={10} />
      </div>
    </div>
  );
}

export function RulebookSkeleton() {
  return (
    <article className="mx-auto max-w-4xl space-y-8 pb-12">
      <header className="space-y-3 border-b border-slate-200 pb-6 text-center">
        <Skeleton className="mx-auto h-10 w-60" />
        <Skeleton className="mx-auto h-4 w-96 max-w-[85%]" />
      </header>
      {Array.from({ length: 4 }).map((_, sectionIndex) => (
        <section
          key={sectionIndex}
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-5"
        >
          <Skeleton className="h-7 w-48 max-w-[60%]" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[92%]" />
          <Skeleton className="h-4 w-[76%]" />
          {sectionIndex % 2 === 0 ? (
            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </div>
          ) : null}
        </section>
      ))}
    </article>
  );
}

export function FreeAgencySkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-4 w-[34rem] max-w-[90%]" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-12 rounded-full" />
        ))}
      </div>
      <div className="space-y-3 lg:hidden">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-5 w-40 max-w-[80%]" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2">
              {Array.from({ length: 5 }).map((_, metricIndex) => (
                <Skeleton key={metricIndex} className="mx-auto h-7 w-10" />
              ))}
            </div>
            <Skeleton className="mt-2 h-11 w-full" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-xl border bg-white lg:block">
        <TableRowsSkeleton columns={8} rows={10} />
      </div>
    </div>
  );
}

export function UserManagementSkeleton() {
  return (
    <section className="mx-auto max-w-6xl py-6">
      <div className="mb-4 space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-[42rem] max-w-[90%]" />
      </div>
      <div className="overflow-hidden rounded-lg border">
        <TableRowsSkeleton columns={5} rows={7} />
      </div>
    </section>
  );
}

export function AdminPanelSkeleton() {
  return (
    <section className="mx-auto max-w-4xl space-y-5 py-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-96 max-w-[85%]" />
      </div>
      <div className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        ))}
        <Skeleton className="h-10 w-36 rounded-md sm:col-span-2" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-white">
        <TableRowsSkeleton columns={5} rows={5} />
      </div>
    </section>
  );
}

export function LeagueOfficeSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8">
      <AdminPanelSkeleton />
    </div>
  );
}

export function LeagueOfficeRouteSkeleton() {
  return (
    <main aria-labelledby="league-office-loading-heading">
      <h1 id="league-office-loading-heading" className="sr-only">
        League Office
      </h1>
      <LeagueOfficeSkeleton />
    </main>
  );
}

export function FreeAgencyListSkeleton() {
  return (
    <div className="mt-8">
      <Skeleton className="mb-2 h-8 w-48" />
      <Skeleton className="mb-4 h-3 w-64" />
      <div className="overflow-hidden rounded-lg border">
        <TableRowsSkeleton columns={6} rows={10} />
      </div>
    </div>
  );
}

import { Skeleton } from "../ui/SkeletonPrimitive";

function ScheduleColumnHeaderSkeleton({
  variant,
}: {
  variant: "team" | "week";
}) {
  return variant === "team" ? (
    <div className="mx-auto mb-2 grid grid-cols-9 gap-2 px-2">
      <Skeleton className="h-3 w-8 justify-self-center" />
      <Skeleton className="col-span-6 h-3 w-20 justify-self-center" />
      <Skeleton className="col-span-2 h-3 w-10 justify-self-center" />
    </div>
  ) : (
    <div className="mx-auto mb-2 grid grid-cols-10 gap-2 px-2">
      <Skeleton className="col-span-4 h-3 w-20 justify-self-center" />
      <Skeleton className="col-span-2 h-3 w-10 justify-self-center" />
      <Skeleton className="col-span-4 h-3 w-20 justify-self-center" />
    </div>
  );
}

export function TeamScheduleRowSkeleton() {
  return (
    <div className="grid min-h-10 grid-cols-9 items-center border-b py-2">
      <Skeleton className="h-4 w-8 justify-self-center" />
      <div className="col-span-6 flex items-center justify-center gap-2">
        <Skeleton className="h-6 w-6 rounded-md" />
        <Skeleton className="h-4 w-32 max-w-[70%]" />
      </div>
      <Skeleton className="col-span-2 h-4 w-12 justify-self-center" />
    </div>
  );
}

export function WeeklyMatchupRowSkeleton() {
  return (
    <div className="mx-1 mb-3 grid min-h-[5.25rem] grid-cols-10 items-center rounded-xl bg-slate-50 py-1 shadow-md">
      <div className="col-span-4 flex flex-col items-center gap-2 p-2">
        <Skeleton className="h-9 w-9 rounded-md sm:h-12 sm:w-12" />
        <Skeleton className="h-4 w-24 max-w-full" />
      </div>
      <Skeleton className="col-span-2 h-6 w-14 justify-self-center" />
      <div className="col-span-4 flex flex-col items-center gap-2 p-2">
        <Skeleton className="h-9 w-9 rounded-md sm:h-12 sm:w-12" />
        <Skeleton className="h-4 w-24 max-w-full" />
      </div>
    </div>
  );
}

export function MatchupStatsSkeleton() {
  return (
    <div className="mx-auto w-5/6 overflow-hidden py-2">
      <div className="grid min-w-[38rem] grid-cols-[2rem_3rem_repeat(8,1fr)] items-center gap-2">
        {Array.from({ length: 30 }).map((_, index) => (
          <Skeleton
            key={index}
            className={index % 10 === 0 ? "h-6 w-6 rounded-md" : "h-3 w-full"}
          />
        ))}
      </div>
    </div>
  );
}

export function TeamScheduleSkeleton() {
  return (
    <div className="mx-2 mb-40 mt-4">
      <ScheduleColumnHeaderSkeleton variant="team" />
      <div>
        {Array.from({ length: 10 }).map((_, index) => (
          <TeamScheduleRowSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

export function WeeklyScheduleSkeleton() {
  return (
    <div className="mx-2 mb-40 mt-4">
      <ScheduleColumnHeaderSkeleton variant="week" />
      <div>
        {Array.from({ length: 6 }).map((_, index) => (
          <WeeklyMatchupRowSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

export function ScheduleSkeleton() {
  return <WeeklyScheduleSkeleton />;
}

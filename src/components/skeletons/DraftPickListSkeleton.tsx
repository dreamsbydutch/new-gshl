import { Skeleton } from "../ui/SkeletonPrimitive";

export function DraftPickListSkeleton({
  showHeader = true,
}: {
  showHeader?: boolean;
}) {
  return (
    <section>
      {showHeader ? (
        <div className="mb-1 flex items-center justify-between gap-3">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-6 w-24" />
        </div>
      ) : null}
      <div>
        {Array.from({ length: 10 }).map((_, index) => (
          <div
            key={index}
            className="flex h-[29px] items-center border-b border-slate-100"
          >
            <Skeleton
              className={`h-3 ${
                index % 3 === 0 ? "w-56" : index % 3 === 1 ? "w-44" : "w-36"
              } max-w-full`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

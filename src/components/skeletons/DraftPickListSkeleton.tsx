import { Skeleton } from "../ui/SkeletonPrimitive";

export function DraftPickListSkeleton() {
  return (
    <section className="pb-8">
      <div className="mx-auto mt-4 flex items-center justify-center gap-2 py-3">
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-6 w-24" />
      </div>
      <div>
        {Array.from({ length: 10 }).map((_, index) => (
          <div
            key={index}
            className="mx-auto w-5/6 border-t border-gray-300 px-2 py-1"
          >
            <Skeleton
              className={`mx-auto h-3 ${
                index % 3 === 0 ? "w-56" : index % 3 === 1 ? "w-44" : "w-36"
              } max-w-full`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

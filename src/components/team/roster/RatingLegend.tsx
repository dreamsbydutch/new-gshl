"use client";

import { RATING_RANGES } from "@gshl-utils";

export function RatingLegend() {
  return (
    <details className="mt-2 text-xs text-slate-500">
      <summary className="min-h-9 cursor-pointer py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">
        Rating guide
      </summary>
      <div className="flex flex-wrap gap-2 pb-2">
        {RATING_RANGES.map((rating) => (
          <div
            key={rating.range}
            className={`max-w-fit place-self-center rounded-lg px-2 text-2xs ${rating.class}`}
          >
            {rating.range}
          </div>
        ))}
      </div>
    </details>
  );
}

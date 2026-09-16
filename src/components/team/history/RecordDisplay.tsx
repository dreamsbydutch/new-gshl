"use client";

import type { RecordDisplayProps } from "@gshl-types";
import { calculateWinPercentage } from "@gshl-utils";

export function RecordDisplay({ winLossRecord }: RecordDisplayProps) {
  const winPercentage = calculateWinPercentage(winLossRecord);

  return (
    <div className="my-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
      <div className="text-xs text-slate-500">Record</div>
      <div className="font-semibold tabular-nums">
        {winLossRecord[0]}-{winLossRecord[1]}-{winLossRecord[2]} -{" "}
        {winPercentage}%
      </div>
    </div>
  );
}

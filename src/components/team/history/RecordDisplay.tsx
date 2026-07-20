"use client";

import type { RecordDisplayProps } from "@gshl-types";
import { calculateWinPercentage } from "@gshl-utils";

export function RecordDisplay({ winLossRecord }: RecordDisplayProps) {
  const winPercentage = calculateWinPercentage(winLossRecord);

  return (
    <div className="mx-auto mt-10 w-full max-w-3xl text-xl font-bold">
      <div>All-Time Record:</div>
      <div>
        {winLossRecord[0]}-{winLossRecord[1]}-{winLossRecord[2]} -{" "}
        {winPercentage}%
      </div>
    </div>
  );
}

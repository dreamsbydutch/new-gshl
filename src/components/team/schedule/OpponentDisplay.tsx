"use client";

export function OpponentDisplay({ opponentText }: { opponentText: string }) {
  return (
    <div className="col-span-6 place-self-center font-varela text-base">
      {opponentText}
    </div>
  );
}

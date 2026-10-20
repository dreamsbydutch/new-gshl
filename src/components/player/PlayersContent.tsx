"use client";

import { Performances } from "@gshl-components/league-office/Performances";

export function PlayersContent() {
  return (
    <main className="gshl-page" aria-label="Player research">
      <h1 className="sr-only">Player research</h1>
      <Performances />
    </main>
  );
}

"use client";

import { useNavStore } from "@gshl-cache";
import { DraftBoardList } from "@gshl-components/DraftBoardList";
import { FreeAgencyList } from "@gshl-components/FreeAgencyList";

export default function LeagueOfficePage() {
  const officeToggle = useNavStore();
  return (
    <div className="container mx-auto px-4 py-8">
      {officeToggle.selectedLeagueOfficeType === "freeagent" && (
        <FreeAgencyList />
      )}
      {officeToggle.selectedLeagueOfficeType === "draftboard" && (
        <DraftBoardList />
      )}
    </div>
  );
}

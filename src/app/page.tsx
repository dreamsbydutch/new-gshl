"use client";

import { FreeAgencyList } from "@gshl-components/FreeAgencyList";
// import LeagueOfficePage from "./leagueoffice/page";

export default function Home() {
  return (
    <main className="container mx-auto px-4">
      <FreeAgencyList />
      {/* <LeagueOfficePage /> */}
      {/* <DraftBoardList />
      <DraftAnnouncement />
      <MockDraftPreview /> */}
    </main>
  );
}

"use client";

import { DraftAnnouncement } from "@gshl-components/DraftAnnouncement";
import { MockDraftPreview } from "@gshl-components/DraftBoardList";

export default function Home() {
  return (
    <main className="container mx-auto px-4">
      <DraftAnnouncement />
      <MockDraftPreview />
    </main>
  );
}

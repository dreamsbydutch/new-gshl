import { RosterPosition, type ToggleItem } from "@gshl-types";
import { useState } from "react";
import { DraftBoardTable, MockDraftList } from "./components";
import { useDraftBoardData } from "@gshl-hooks";
// utilities exported from utils if needed later

export function DraftBoardList({
  seasonId = "12",
  navbarToggle = false,
}: {
  seasonId?: string;
  navbarToggle?: boolean;
}) {
  const [selectedType, setSelectedType] = useState<string>("all");
  const {
    isLoading,
    draftPlayers,
    filteredPlayers,
    nhlTeams,
    gshlTeams,
    seasonDraftPicks,
  } = useDraftBoardData({ seasonId, selectedType });

  if (isLoading) {
    return (
      <div className="mt-6">
        <h2 className="mb-1 text-xl font-semibold">Draft Board</h2>
        <p className="text-gray-500">Loading players...</p>
      </div>
    );
  }

  const pageToolbarProps: {
    toolbarKeys: ToggleItem<string | null>[];
    activeKey: string | null;
    className?: [string?, string?, string?];
  } = {
    className: ["bottom-24 h-8", "h-6", "text-xs"],
    activeKey: selectedType,
    toolbarKeys: [
      {
        key: "mockdraft",
        value: "Mock Draft",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "all",
        value: "All",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "forward",
        value: "F",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "center",
        value: "C",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "leftwing",
        value: "LW",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "rightwing",
        value: "RW",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "defense",
        value: "D",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "goalie",
        value: "G",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "wildcard",
        value: "WC",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
    ],
  };

  if (selectedType === "mockdraft") {
    return (
      <MockDraftList
        seasonDraftPicks={seasonDraftPicks}
        draftPlayers={draftPlayers}
        nhlTeams={nhlTeams}
        gshlTeams={gshlTeams}
        toolbarProps={pageToolbarProps}
      />
    );
  }
  return (
    <DraftBoardTable
      navbar={navbarToggle}
      draftPlayers={
        navbarToggle
          ? filteredPlayers
              .filter((a) => !a.nhlPos.includes(RosterPosition.G))
              .sort((a, b) => +(a.preDraftRk ?? 9999) - +(b.preDraftRk ?? 9999))
          : filteredPlayers.sort(
              (a, b) => +(a.preDraftRk ?? 9999) - +(b.preDraftRk ?? 9999),
            )
      }
      totalCount={draftPlayers.length}
      nhlTeams={nhlTeams}
      toolbarProps={pageToolbarProps}
    />
  );
}

// Minimal wrapper for homepage: only shows mock draft (no toolbar)
export function MockDraftPreview({ seasonId = "12" }: { seasonId?: string }) {
  const { isLoading, draftPlayers, nhlTeams, gshlTeams, seasonDraftPicks } =
    useDraftBoardData({ seasonId, selectedType: "mockdraft" });
  if (isLoading) {
    return (
      <div className="mt-6 text-center">
        <h2 className="mb-1 text-xl font-semibold">GSHL Mock Draft</h2>
        <p className="text-gray-500">Loading mock draft...</p>
      </div>
    );
  }
  return (
    <MockDraftList
      seasonDraftPicks={seasonDraftPicks}
      draftPlayers={draftPlayers}
      toolbarProps={undefined}
      // pickedPlayers= {1}
      nhlTeams={nhlTeams}
      gshlTeams={gshlTeams}
    />
  );
}

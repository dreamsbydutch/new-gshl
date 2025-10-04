"use client";

// import { useNavStore } from "@gshl-cache";
import { DraftBoardList } from "@gshl-components/DraftBoardList";
import { FreeAgencyList } from "@gshl-components/FreeAgencyList";
import { useAllDraftPicks, useTeamsBySeasonId } from "@gshl-hooks";
import { Button } from "@gshl-ui";
import { cn } from "@gshl-utils";
import { RefreshCw } from "lucide-react";
import Image from "next/image";
import { useState, useEffect, useCallback } from "react";
import { api } from "src/trpc/react";

export default function LeagueOfficePage() {
  const [isClient, setIsClient] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const utils = api.useUtils();
  const officeToggle = { selectedLeagueOfficeType: "draftboard" };
  // const officeToggle = useNavStore();

  // Use refreshKey to force re-fetch of data
  const { data: draftPicks } = useAllDraftPicks();
  const { data: gshlTeams } = useTeamsBySeasonId("12");

  const activeDraftPicks = draftPicks
    ?.filter((a) => a.seasonId === "12" && a.playerId === null)
    .sort((a, b) => +a.pick - +b.pick)
    .slice(0, 8);

  // Get the current (next) draft pick
  const currentDraftPick = activeDraftPicks?.[0];

  // Set client flag after hydration and initialize timestamp
  useEffect(() => {
    setIsClient(true);
    setLastUpdated(new Date());
  }, []);

  const handleDataRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Invalidate and refetch the relevant queries
      await Promise.all([utils.draftPick.getAll.invalidate()]);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to refresh data:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [utils.draftPick.getAll]);

  // Auto-refresh every 45 seconds (only on client)
  useEffect(() => {
    if (!isClient) return;

    const intervalId = setInterval(() => {
      void handleDataRefresh();
    }, 45000); // 45 seconds

    return () => clearInterval(intervalId);
  }, [isClient, handleDataRefresh]);

  const handleManualRefresh = () => {
    void handleDataRefresh();
  };

  const formatLastUpdated = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {!currentDraftPick && (
            <span className="text-sm text-muted-foreground">
              No draft picks available
            </span>
          )}
        </div>
        <div className="flex items-center">
          {isClient && lastUpdated && (
            <div className="mr-4 flex flex-col items-center">
              <div className="text-xs text-muted-foreground">
                Last updated:{" "}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatLastUpdated(lastUpdated)}
              </div>
            </div>
          )}
          <Button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <RefreshCw
              className={cn("h-4 w-4", isRefreshing && "animate-spin")}
            />
          </Button>
        </div>
      </div>
      <div className="mb-6 flex flex-col items-center justify-between">
        <h1 className="text-3xl font-bold">Next 8 Picks</h1>
        <div className="my-2 space-y-2 text-center text-sm text-muted-foreground">
          {activeDraftPicks?.map((pick, i) => {
            const team = gshlTeams?.find((t) => t.id === pick.gshlTeamId);
            return (
              <div
                key={pick.id}
                className={cn(
                  "text-sm",
                  i === 0
                    ? "rounded-md border bg-green-100 p-2 text-base font-semibold text-black shadow-lg"
                    : i === 1
                      ? "rounded-md border bg-green-50 p-1 text-base text-black shadow-sm"
                      : i === 2
                        ? "rounded-md border p-1 text-sm text-black shadow-sm"
                        : "",
                )}
              >
                Round {pick.round}, Pick {pick.pick} -{" "}
                {team?.logoUrl ? (
                  <Image
                    src={team.logoUrl}
                    alt={team?.name ?? ""}
                    width={16}
                    height={16}
                    className="mr-1 inline-block h-4 w-4"
                  />
                ) : (
                  <div className="mr-1 inline-block h-4 w-4 rounded bg-gray-200" />
                )}{" "}
                {team?.name}
              </div>
            );
          })}
        </div>
      </div>
      {officeToggle.selectedLeagueOfficeType === "freeagent" && (
        <FreeAgencyList />
      )}
      {officeToggle.selectedLeagueOfficeType === "draftboard" && (
        <DraftBoardList />
      )}
    </div>
  );
}

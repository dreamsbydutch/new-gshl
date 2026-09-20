"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { WhatsAppShareButton } from "@gshl-components/ui/WhatsAppShareButton";
import {
  useAuthSession,
  useNHLTeams,
  useToast,
  useTradeBlockMarket,
} from "@gshl-hooks";
import type { GSHLTeam, NHLTeam } from "@gshl-types";
import { Button, Input, Select, Skeleton } from "@gshl-ui";
import {
  findNhlTeamByAbbreviation,
  formatMoney,
  buildLockerRoomNavigationHref,
  getTradeBlockPerspective,
  TRADE_BLOCK_NOTE_LIMIT,
} from "@gshl-utils";
import { buildTradeBlockWhatsAppShareMessage } from "@gshl-utils/features/whatsapp-messages";
import { canShareOwnerContent } from "@gshl-utils/features/whatsapp-share";

const POSITION_FILTERS = [
  { value: "all", label: "All players" },
  { value: "F", label: "Forwards" },
  { value: "D", label: "Defence" },
  { value: "G", label: "Goalies" },
] as const;

export function TradeBlock({
  currentTeam,
}: {
  currentTeam: Pick<GSHLTeam, "ownerId" | "name">;
}) {
  const { session } = useAuthSession();
  const market = useTradeBlockMarket();
  const nhlTeamsQuery = useNHLTeams();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("all");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [note, setNote] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const nhlTeams = nhlTeamsQuery.data;
  const candidates = useMemo(
    () => market.data?.candidates ?? [],
    [market.data?.candidates],
  );
  const selectedCandidate = candidates.find(
    (candidate) => candidate.playerId === selectedPlayerId,
  );

  useEffect(() => {
    if (candidates.length === 0) {
      setSelectedPlayerId("");
      setNote("");
      return;
    }
    if (
      !candidates.some((candidate) => candidate.playerId === selectedPlayerId)
    ) {
      setSelectedPlayerId(candidates[0]?.playerId ?? "");
    }
  }, [candidates, selectedPlayerId]);

  useEffect(() => {
    setNote(selectedCandidate?.note ?? "");
  }, [
    selectedCandidate?.listingId,
    selectedCandidate?.note,
    selectedCandidate?.playerId,
  ]);

  const perspective = getTradeBlockPerspective(
    market.data?.listings ?? [],
    String(currentTeam.ownerId ?? ""),
    market.data?.viewerOwnerId,
    Boolean(market.data?.canManage),
  );
  const listings = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return perspective.leagueListings.filter((listing) => {
      if (position !== "all" && listing.posGroup !== position) return false;
      if (!normalizedSearch) return true;
      return [
        listing.fullName,
        listing.team.name,
        listing.team.abbr,
        ...listing.nhlTeam,
        ...listing.nhlPos,
        listing.note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedSearch);
    });
  }, [perspective.leagueListings, position, search]);

  const canShare = canShareOwnerContent(session?.user.role);

  const saveListing = async () => {
    if (!selectedCandidate || !perspective.canManageTeam) return;
    try {
      await market.save.mutateAsync({
        playerId: selectedCandidate.playerId,
        note,
      });
      setIsEditing(false);
      toast({
        title: selectedCandidate.listingId
          ? "Listing updated"
          : "Player listed",
        description: `${selectedCandidate.fullName} is visible on the league trade block.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Trade block was not updated",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const removeListing = async () => {
    if (!selectedCandidate?.listingId || !perspective.canManageTeam) return;
    try {
      await market.remove.mutateAsync({
        listingId: selectedCandidate.listingId,
      });
      setIsEditing(false);
      toast({
        title: "Player removed",
        description: `${selectedCandidate.fullName} is no longer on the trade block.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Listing was not removed",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  if (market.isLoading) return <TradeBlockLoading />;

  return (
    <section
      aria-labelledby="trade-block-heading"
      className="w-full lg:max-w-3xl"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 id="trade-block-heading" className="text-base font-semibold">
          Trade Block
        </h2>
        {canShare && (market.data?.listings.length ?? 0) > 0 ? (
          <WhatsAppShareButton
            message={buildTradeBlockWhatsAppShareMessage(
              market.data?.listings ?? [],
            )}
            path={buildLockerRoomNavigationHref("", {
              view: "tradeBlock",
              owner: currentTeam.ownerId,
            })}
            label="Share trade block"
          />
        ) : null}
      </header>
      <section
        aria-labelledby="manage-trade-block-heading"
        className="mb-3 border-b border-slate-200 pb-3"
      >
        <div className="flex min-h-9 items-center justify-between gap-2">
          <h3 id="manage-trade-block-heading" className="text-sm font-semibold">
            {perspective.canManageTeam ? "Your listings" : "Team listings"}
            <span className="ml-2 font-normal text-slate-500">
              {perspective.teamListings.length}
            </span>
          </h3>
          {perspective.canManageTeam && candidates.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setIsEditing(!isEditing)}
              aria-expanded={isEditing}
              aria-controls="trade-block-editor"
            >
              {isEditing ? "Close" : "List player"}
            </Button>
          ) : null}
        </div>
        {isEditing && perspective.canManageTeam ? (
          <form
            id="trade-block-editor"
            className="my-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void saveListing();
            }}
          >
            <label className="text-xs text-slate-600">
              Player
              <Select
                id="trade-block-player"
                value={selectedPlayerId}
                onValueChange={setSelectedPlayerId}
                className="mt-1 h-9 min-h-9 text-xs"
              >
                {candidates.map((candidate) => (
                  <option key={candidate.playerId} value={candidate.playerId}>
                    {candidate.fullName}
                    {candidate.listingId ? " - Listed" : ""}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs text-slate-600">
              Looking for
              <Input
                value={note}
                maxLength={TRADE_BLOCK_NOTE_LIMIT}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Picks, cap relief, positions..."
                className="mt-1 h-9 text-xs"
              />
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={
                  !selectedCandidate ||
                  market.save.isPending ||
                  market.remove.isPending
                }
              >
                {market.save.isPending
                  ? "Saving..."
                  : selectedCandidate?.listingId
                    ? "Save changes"
                    : "List player"}
              </Button>
              {selectedCandidate?.listingId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={removeListing}
                  disabled={market.remove.isPending || market.save.isPending}
                >
                  Unlist
                </Button>
              ) : null}
              <span className="text-[10px] text-slate-400">
                {note.length}/{TRADE_BLOCK_NOTE_LIMIT}
              </span>
            </div>
            <p className="text-xs text-slate-500 sm:col-span-3">
              Your player and request will be visible to the league.
            </p>
          </form>
        ) : null}
        <TradeListingRows
          listings={perspective.teamListings}
          nhlTeams={nhlTeams}
          onEdit={
            perspective.canManageTeam
              ? (playerId) => {
                  setSelectedPlayerId(playerId);
                  setIsEditing(true);
                }
              : undefined
          }
        />
        {perspective.teamListings.length === 0 ? (
          <p className="py-2 text-xs text-slate-500">
            {perspective.canManageTeam
              ? candidates.length
                ? "List a player and tell other owners what you want in return."
                : "No eligible contracted players to list."
              : `${currentTeam.name} has no players listed.`}
          </p>
        ) : null}
      </section>
      <section aria-labelledby="trade-market-heading">
        <h3 id="trade-market-heading" className="mb-2 text-sm font-semibold">
          Around the league{" "}
          <span className="font-normal text-slate-500">
            {perspective.leagueListings.length}
          </span>
        </h3>
        <div className="mb-2 flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search the trade block</span>
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Player, team, or request"
              className="h-9 pl-7 text-xs"
            />
          </label>
          <label className="w-28 shrink-0 sm:w-36">
            <span className="sr-only">Filter by position</span>
            <Select
              value={position}
              onValueChange={setPosition}
              className="h-9 min-h-9 text-xs"
            >
              {POSITION_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <TradeListingRows listings={listings} nhlTeams={nhlTeams} />
        {listings.length === 0 ? (
          <p className="border-t border-slate-100 py-3 text-xs text-slate-500">
            {perspective.leagueListings.length
              ? "No matches. Try another search or position."
              : "No other teams have listed players yet."}
          </p>
        ) : null}
      </section>
    </section>
  );
}

function TradeListingRows({
  listings,
  nhlTeams,
  onEdit,
}: {
  listings: NonNullable<
    ReturnType<typeof useTradeBlockMarket>["data"]
  >["listings"];
  nhlTeams: NHLTeam[];
  onEdit?: (playerId: string) => void;
}) {
  return (
    <div className="divide-y divide-slate-100">
      {listings.map((listing) => {
        const nhlTeam = findNhlTeamByAbbreviation(nhlTeams, listing.nhlTeam);
        return (
          <article key={listing.listingId} className="py-2">
            <div className="flex items-center gap-2">
              {listing.team.logoUrl ? (
                <Image
                  src={listing.team.logoUrl}
                  alt={listing.team.name}
                  title={listing.team.name}
                  width={24}
                  height={24}
                  className="h-6 w-6 shrink-0 object-contain"
                />
              ) : (
                <span className="text-[10px] text-slate-500">
                  {listing.team.abbr}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-xs font-semibold">
                  {listing.fullName}
                </h4>
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                  <NHLLogo team={nhlTeam} size={12} className="mx-0" />
                  <span>{listing.nhlPos.join("/") || listing.posGroup}</span>
                  {listing.overallRating != null ? (
                    <span title="Overall rating">
                      OVR {listing.overallRating.toFixed(1)}
                    </span>
                  ) : null}
                  <span className="truncate">{listing.team.name}</span>
                </div>
              </div>
              <div className="shrink-0 text-right text-xs tabular-nums">
                <p>{formatMoney(listing.capHit)}</p>
                <p className="text-[10px] text-slate-500">
                  Through {listing.expiryDate?.slice(0, 4) ?? "-"}
                </p>
              </div>
              {onEdit ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9"
                  onClick={() => onEdit(listing.playerId)}
                  aria-label={`Edit ${listing.fullName} listing`}
                >
                  Edit
                </Button>
              ) : null}
            </div>
            <p className="mt-1 break-words text-xs text-slate-600">
              <span className="text-slate-400">Looking for: </span>
              {listing.note ?? "Open to offers"}
            </p>
          </article>
        );
      })}
    </div>
  );
}

function TradeBlockLoading() {
  return (
    <div aria-label="Loading trade block" className="space-y-3">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}

"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Search, ShieldCheck, SlidersHorizontal } from "lucide-react";

import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { WhatsAppShareButton } from "@gshl-components/ui/WhatsAppShareButton";
import {
  useAuthSession,
  useNHLTeams,
  useToast,
  useTradeBlockMarket,
} from "@gshl-hooks";
import type { NHLTeam } from "@gshl-types";
import { Button, Input, Select, Skeleton } from "@gshl-ui";
import {
  findNhlTeamByAbbreviation,
  formatMoney,
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

export function TradeBlock() {
  const { session } = useAuthSession();
  const market = useTradeBlockMarket();
  const nhlTeamsQuery = useNHLTeams();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("all");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [note, setNote] = useState("");

  const nhlTeams = useMemo(
    () => nhlTeamsQuery.data.filter((team): team is NHLTeam => "abbr" in team),
    [nhlTeamsQuery.data],
  );
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

  const listings = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return (market.data?.listings ?? []).filter((listing) => {
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
  }, [market.data?.listings, position, search]);

  const listedTeams = new Set(
    (market.data?.listings ?? []).map((listing) => listing.ownerId),
  ).size;
  const canShare = canShareOwnerContent(session?.user.role);

  const saveListing = async () => {
    if (!selectedCandidate) return;
    try {
      await market.save.mutateAsync({
        playerId: selectedCandidate.playerId,
        note,
      });
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
    if (!selectedCandidate?.listingId) return;
    try {
      await market.remove.mutateAsync({
        listingId: selectedCandidate.listingId,
      });
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
    <div className="mx-auto max-w-7xl pb-6">
      <header className="flex flex-col gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/favicon.ico"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-md object-contain"
          />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">
              Trade Block
            </h2>
            <p className="text-sm text-slate-500">League market</p>
          </div>
        </div>
        <dl className="flex gap-4 text-sm">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-slate-500">Players</dt>
            <dd className="font-mono font-semibold text-slate-950">
              {market.data?.listings.length ?? 0}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-slate-500">Teams</dt>
            <dd className="font-mono font-semibold text-slate-950">
              {listedTeams}
            </dd>
          </div>
        </dl>
      </header>

      {market.data?.canManage && candidates.length > 0 ? (
        <section
          aria-labelledby="manage-trade-block-heading"
          className="border-b border-slate-200 py-3"
        >
          <h3
            id="manage-trade-block-heading"
            className="mb-2 text-sm font-semibold text-slate-950"
          >
            Your listings
          </h3>
          <div className="grid gap-2 lg:grid-cols-[16rem_minmax(0,1fr)_auto] lg:items-end">
            <label className="text-xs font-medium text-slate-600">
              Player
              <Select
                id="trade-block-player"
                value={selectedPlayerId}
                onValueChange={setSelectedPlayerId}
                className="mt-1"
              >
                {candidates.map((candidate) => (
                  <option key={candidate.playerId} value={candidate.playerId}>
                    {candidate.fullName}
                    {candidate.listingId ? " · Listed" : ""}
                  </option>
                ))}
              </Select>
            </label>
            <label className="min-w-0 text-xs font-medium text-slate-600">
              <span className="flex items-center justify-between gap-3">
                Looking for
                <span className="font-normal text-slate-400">
                  {note.length}/{TRADE_BLOCK_NOTE_LIMIT}
                </span>
              </span>
              <textarea
                value={note}
                maxLength={TRADE_BLOCK_NOTE_LIMIT}
                onChange={(event) => setNote(event.target.value)}
                rows={1}
                placeholder="Picks, cap relief, position…"
                className="mt-1 min-h-11 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:min-h-10"
              />
            </label>
            <div className="flex gap-2">
              {selectedCandidate?.listingId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={removeListing}
                  disabled={market.remove.isPending || market.save.isPending}
                >
                  Remove
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={saveListing}
                disabled={
                  !selectedCandidate ||
                  market.save.isPending ||
                  market.remove.isPending
                }
              >
                {market.save.isPending
                  ? "Saving…"
                  : selectedCandidate?.listingId
                    ? "Update"
                    : "Add player"}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="trade-market-heading" className="mt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h3
            id="trade-market-heading"
            className="text-lg font-semibold text-slate-950"
          >
            Available players
          </h3>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {canShare && (market.data?.listings.length ?? 0) > 0 ? (
              <WhatsAppShareButton
                message={buildTradeBlockWhatsAppShareMessage(
                  market.data?.listings ?? [],
                )}
                path="/leagueoffice?view=tradeBlock"
                label="Share trade block"
              />
            ) : null}
            <label className="relative block min-w-0 sm:w-64">
              <span className="sr-only">Search the trade block</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Player or team"
                className="pl-9"
              />
            </label>
            <label className="relative block sm:w-40">
              <span className="sr-only">Filter by position</span>
              <SlidersHorizontal
                className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <Select
                value={position}
                onValueChange={setPosition}
                className="pl-9"
              >
                {POSITION_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </div>

        {listings.length > 0 ? (
          <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {listings.map((listing) => {
              const nhlTeam = findNhlTeamByAbbreviation(
                nhlTeams,
                listing.nhlTeam,
              );
              return (
                <article
                  key={listing.listingId}
                  id={`trade-block-${listing.listingId}`}
                  className="grid scroll-mt-32 gap-3 px-3 py-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(15rem,1.2fr)] sm:items-center"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center"
                      title={listing.team.name}
                    >
                      {listing.team.logoUrl ? (
                        <Image
                          src={listing.team.logoUrl}
                          alt=""
                          width={40}
                          height={40}
                          className="h-10 w-10 object-contain"
                        />
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">
                          {listing.team.abbr || "GSHL"}
                        </span>
                      )}
                      <span className="sr-only">{listing.team.name}</span>
                    </span>
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold text-slate-950">
                        {listing.fullName}
                      </h4>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                        {nhlTeam ? (
                          <NHLLogo
                            team={nhlTeam}
                            size={18}
                            className="mx-0 shrink-0"
                          />
                        ) : null}
                        <span>
                          {listing.nhlPos.join("/") || listing.posGroup}
                          {!nhlTeam && listing.nhlTeam.length
                            ? ` · ${listing.nhlTeam.join("/")}`
                            : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <dl className="grid grid-cols-3 gap-3 text-xs">
                      <ListingStat
                        label="Cap hit"
                        value={formatMoney(listing.capHit)}
                      />
                      <ListingStat
                        label="Through"
                        value={listing.expiryDate?.slice(0, 4) ?? "—"}
                      />
                      <ListingStat
                        label="Overall"
                        value={listing.overallRating?.toFixed(1) ?? "—"}
                      />
                    </dl>
                    <p className="mt-1.5 truncate text-xs text-slate-600">
                      <span className="sr-only">GM note: </span>
                      {listing.note ?? "Open to offers."}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 border-y border-dashed border-slate-300 py-6 text-center">
            <ShieldCheck
              className="mx-auto h-6 w-6 text-slate-400"
              aria-hidden="true"
            />
            <h4 className="mt-2 font-medium text-slate-900">
              {market.data?.listings.length ? "No matches" : "No listings"}
            </h4>
            <p className="text-sm text-slate-500">
              {market.data?.listings.length
                ? "Change a filter or search."
                : "Owners can list contracted players above."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function ListingStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] text-slate-400">{label}</dt>
      <dd className="font-mono font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function TradeBlockLoading() {
  return (
    <div className="mx-auto max-w-7xl pb-6" aria-label="Loading trade block">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
        <Skeleton className="h-10 w-10 rounded-md" />
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="hidden h-8 w-20 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

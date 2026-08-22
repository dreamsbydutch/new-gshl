"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  BadgeDollarSign,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

import { useToast, useTradeBlockMarket } from "@gshl-hooks";
import { Button, Input, Select, Skeleton } from "@gshl-ui";
import { cn, formatMoney, TRADE_BLOCK_NOTE_LIMIT } from "@gshl-utils";
import { WhatsAppShareButton } from "@gshl-components/ui/WhatsAppShareButton";
import { buildWhatsAppShareMessage } from "@gshl-utils/features/whatsapp-share";

const POSITION_FILTERS = [
  { value: "all", label: "All players" },
  { value: "F", label: "Forwards" },
  { value: "D", label: "Defence" },
  { value: "G", label: "Goalies" },
] as const;

export function TradeBlock() {
  const market = useTradeBlockMarket();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("all");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [note, setNote] = useState("");

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
    <div className="mx-auto max-w-7xl pb-12">
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-white shadow-sm">
        <div className="grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-emerald-300">
              <ArrowRightLeft className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
              League market
            </p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
              Trade Block
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              See who is genuinely available, the contract you would inherit,
              and what the other GM wants before starting a conversation.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-center">
            <div className="min-w-28 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <dt className="text-xs text-slate-400">Available</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {market.data?.listings.length ?? 0}
              </dd>
            </div>
            <div className="min-w-28 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <dt className="text-xs text-slate-400">Teams</dt>
              <dd className="mt-1 text-2xl font-semibold">{listedTeams}</dd>
            </div>
          </dl>
        </div>
      </header>

      {market.data?.canManage && candidates.length > 0 ? (
        <section
          aria-labelledby="manage-trade-block-heading"
          className="relative z-10 mx-3 -mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-md sm:mx-6 sm:p-5"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="lg:w-64">
              <h3
                id="manage-trade-block-heading"
                className="text-sm font-semibold text-slate-950"
              >
                Manage my trade block
              </h3>
              <label
                htmlFor="trade-block-player"
                className="mt-2 block text-xs font-medium text-slate-600"
              >
                Contracted player
              </label>
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
            </div>
            <label className="min-w-0 flex-1 text-xs font-medium text-slate-600">
              <span className="flex items-center justify-between gap-3">
                What are you looking for?
                <span className="font-normal text-slate-400">
                  {note.length}/{TRADE_BLOCK_NOTE_LIMIT}
                </span>
              </span>
              <textarea
                value={note}
                maxLength={TRADE_BLOCK_NOTE_LIMIT}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="Example: Looking for picks or a lower-cap forward."
                className="mt-1 min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </label>
            <div className="flex gap-2 lg:pb-0.5">
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
                    ? "Update listing"
                    : "Add to block"}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="trade-market-heading" className="mt-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3
              id="trade-market-heading"
              className="text-xl font-bold text-slate-950"
            >
              Available players
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Contract figures are the current inherited cap commitment.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
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
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {listings.map((listing) => (
              <article
                key={listing.listingId}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md motion-reduce:transition-none"
              >
                <div className="flex items-start gap-3 border-b border-slate-100 p-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                    {listing.team.logoUrl ? (
                      <Image
                        src={listing.team.logoUrl}
                        alt=""
                        width={40}
                        height={40}
                        className="h-10 w-10 object-contain"
                      />
                    ) : (
                      <ArrowRightLeft
                        className="h-5 w-5 text-slate-400"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="truncate font-semibold text-slate-950">
                          {listing.fullName}
                        </h4>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {listing.nhlPos.join("/") || listing.posGroup} ·{" "}
                          {listing.nhlTeam.join("/") || "FA"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                        Available
                      </span>
                    </div>
                    <p className="mt-2 truncate text-xs font-medium text-slate-600">
                      {listing.team.name}
                    </p>
                  </div>
                </div>
                <dl className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50/70 text-center">
                  <div className="px-2 py-3">
                    <dt className="text-[11px] text-slate-500">Cap hit</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                      {formatMoney(listing.capHit)}
                    </dd>
                  </div>
                  <div className="px-2 py-3">
                    <dt className="text-[11px] text-slate-500">Through</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                      {listing.expiryDate?.slice(0, 4) ?? "—"}
                    </dd>
                  </div>
                  <div className="px-2 py-3">
                    <dt className="text-[11px] text-slate-500">Overall</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                      {listing.overallRating?.toFixed(1) ?? "—"}
                    </dd>
                  </div>
                </dl>
                <div className="min-h-20 p-4">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <BadgeDollarSign
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                    GM note
                  </div>
                  <p
                    className={cn(
                      "mt-1.5 text-sm leading-5",
                      listing.note ? "text-slate-700" : "italic text-slate-400",
                    )}
                  >
                    {listing.note ?? "Open to ideas — make an offer."}
                  </p>
                </div>
                {market.data?.canManage ? (
                  <div className="flex justify-end border-t border-slate-100 px-4 py-3">
                    <WhatsAppShareButton
                      message={buildWhatsAppShareMessage({
                        title: "GSHL Trade Block Update",
                        summary: `${listing.fullName} is available from ${listing.team.name}`,
                        lines: [
                          `${listing.nhlPos.join("/") || listing.posGroup} · ${listing.nhlTeam.join("/") || "FA"}`,
                          `Cap hit: ${formatMoney(listing.capHit)} · Through ${listing.expiryDate?.slice(0, 4) ?? "TBD"}`,
                          listing.note
                            ? `GM note: ${listing.note}`
                            : "GM note: Open to ideas — make an offer.",
                        ],
                      })}
                      path="/leagueoffice?view=tradeBlock"
                      label="Share listing"
                      ariaLabel={`Share ${listing.fullName} trade-block listing to WhatsApp`}
                    />
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center">
            <ShieldCheck
              className="mx-auto h-8 w-8 text-slate-400"
              aria-hidden="true"
            />
            <h4 className="mt-3 font-semibold text-slate-900">
              {market.data?.listings.length
                ? "No players match these filters"
                : "The trade block is clear"}
            </h4>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              {market.data?.listings.length
                ? "Try a broader search or another position."
                : "Owners can add a contracted player above. Listings update for the whole league in real time."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function TradeBlockLoading() {
  return (
    <div
      className="mx-auto max-w-7xl space-y-5 pb-12"
      aria-label="Loading trade block"
    >
      <Skeleton className="h-60 rounded-2xl" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-64 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

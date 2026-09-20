"use client";

import { Component, type ReactNode } from "react";
import { Button, Input, Select } from "@gshl-ui";
import { useAccountsManagement } from "@gshl-hooks/features/useAccountsManagement";
import { accountMoney } from "@gshl-lib/utils/features/accounts";
import type { AccountEntryKind } from "@gshl-lib/types/accounts";

class AccountsErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div role="alert" className="space-y-3 rounded-lg border p-6">
          <p>
            Accounts could not be loaded. An active commissioner account is
            required.
          </p>
          <Button onClick={() => this.setState({ failed: false })}>
            Try again
          </Button>
        </div>
      );
    return this.props.children;
  }
}

export function AccountsManagement() {
  return (
    <AccountsErrorBoundary>
      <AccountsPanel />
    </AccountsErrorBoundary>
  );
}

function AccountsPanel() {
  const ledger = useAccountsManagement();
  const newFees = ledger.preview?.filter((fee) => !fee.assessed) ?? [];
  if (!ledger.overview)
    return (
      <p role="status" className="p-6">
        Loading owner accounts…
      </p>
    );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Owner accounts</h1>
        <p className="text-sm text-muted-foreground">
          Commissioner ledger for current and former owners. All amounts are in
          CAD.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-background p-4">
          <p className="text-sm text-muted-foreground">
            Total outstanding · all owners
          </p>
          <p className="text-2xl font-semibold">
            {accountMoney(ledger.outstanding)}
          </p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <p className="text-sm text-muted-foreground">
            Owner credits · all owners
          </p>
          <p className="text-2xl font-semibold">
            {accountMoney(ledger.credits)}
          </p>
        </div>
      </div>
      {ledger.error && (
        <p
          role="alert"
          className="rounded-md border border-destructive p-3 text-destructive"
        >
          {ledger.error}
        </p>
      )}
      {ledger.message && (
        <p role="status" className="rounded-md border p-3">
          {ledger.message}
        </p>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(240px,1fr)_2fr]">
        <section
          aria-label="Owner balances"
          className="space-y-3 rounded-lg border p-4"
        >
          <label className="block space-y-1 text-sm">
            Search owners
            <Input
              value={ledger.search}
              onChange={(event) => ledger.setSearch(event.target.value)}
              placeholder="Owner name"
            />
          </label>
          <label className="block space-y-1 text-sm">
            Owner status
            <Select
              value={ledger.filter}
              onChange={(event) => ledger.setFilter(event.target.value)}
            >
              <option value="all">All owners</option>
              <option value="active">Current owners</option>
              <option value="former">Former owners</option>
            </Select>
          </label>
          {!ledger.visibleOwners.length && (
            <p className="text-sm text-muted-foreground">
              No owners match these filters.
            </p>
          )}
          <ul className="max-h-[32rem] space-y-2 overflow-y-auto">
            {ledger.visibleOwners.map((owner) => (
              <li key={owner._id}>
                <button
                  type="button"
                  disabled={ledger.pending}
                  aria-pressed={ledger.ownerId === owner._id}
                  onClick={() => ledger.selectOwner(owner._id)}
                  className={`w-full rounded-md border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${ledger.ownerId === owner._id ? "border-primary bg-muted" : "hover:bg-muted/50"}`}
                >
                  <span className="block font-medium">
                    {owner.firstName} {owner.lastName}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {owner.isActive ? "Current owner" : "Former owner"}
                  </span>
                  <span className="mt-1 block text-sm">
                    {accountMoney(Math.abs(owner.balanceCents))}{" "}
                    {owner.balanceCents > 0
                      ? "owing"
                      : owner.balanceCents < 0
                        ? "credit"
                        : "settled"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section
          aria-label="Selected owner account"
          className="min-w-0 space-y-6 rounded-lg border p-4"
        >
          {!ledger.selectedOwner ? (
            <p className="text-muted-foreground">
              Select an owner to record a payment or adjustment and view their
              history.
            </p>
          ) : (
            <>
              <div>
                <h2 className="text-xl font-semibold">
                  {ledger.selectedOwner.firstName}{" "}
                  {ledger.selectedOwner.lastName}
                </h2>
                <p>
                  {accountMoney(Math.abs(ledger.selectedOwner.balanceCents))}{" "}
                  {ledger.selectedOwner.balanceCents < 0
                    ? "in credit"
                    : "owing"}
                </p>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void ledger.record();
                }}
              >
                <fieldset disabled={ledger.pending} className="space-y-3">
                  <legend className="mb-3 font-semibold">
                    Record an entry
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1 text-sm">
                      Entry type
                      <Select
                        value={ledger.kind}
                        onChange={(event) =>
                          ledger.setKind(event.target.value as AccountEntryKind)
                        }
                      >
                        <option value="payment">Payment · reduces owing</option>
                        <option value="charge">Charge · increases owing</option>
                        <option value="credit">Credit · reduces owing</option>
                        <option value="refund">Refund · increases owing</option>
                      </Select>
                    </label>
                    <label className="block space-y-1 text-sm">
                      Amount (CAD)
                      <Input
                        required
                        inputMode="decimal"
                        value={ledger.amount}
                        onChange={(event) =>
                          ledger.setAmount(event.target.value)
                        }
                        placeholder="0.00"
                      />
                    </label>
                    <label className="block space-y-1 text-sm">
                      Effective date
                      <Input
                        required
                        type="date"
                        value={ledger.date}
                        onChange={(event) => ledger.setDate(event.target.value)}
                      />
                    </label>
                    <label className="block space-y-1 text-sm">
                      Payment reference (optional)
                      <Input
                        maxLength={200}
                        value={ledger.reference}
                        onChange={(event) =>
                          ledger.setReference(event.target.value)
                        }
                      />
                    </label>
                  </div>
                  <label className="block space-y-1 text-sm">
                    Description
                    <Input
                      required
                      maxLength={500}
                      value={ledger.description}
                      onChange={(event) =>
                        ledger.setDescription(event.target.value)
                      }
                      placeholder="e.g. E-transfer for annual league fee"
                    />
                  </label>
                  <Button type="submit">
                    {ledger.pending ? "Saving…" : "Record entry"}
                  </Button>
                </fieldset>
              </form>
              <div className="space-y-3">
                <h3 className="font-semibold">Account history</h3>
                <p className="text-xs text-muted-foreground">
                  Newest recorded first. Positive entries increase owing;
                  negative entries reduce it.
                </p>
                {ledger.history.status === "LoadingFirstPage" ? (
                  <p role="status">Loading history…</p>
                ) : !ledger.history.results.length ? (
                  <div className="rounded-md bg-muted p-3">
                    <p>
                      Opening balance:{" "}
                      {accountMoney(ledger.selectedOwner.balanceCents)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Existing owner balance. No ledger entries recorded yet.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {ledger.history.results.map((entry) => {
                      const signed =
                        entry.kind === "payment" || entry.kind === "credit"
                          ? -entry.amountCents
                          : entry.amountCents;
                      return (
                        <li
                          key={entry._id}
                          className="space-y-2 rounded-md border p-3"
                        >
                          <div className="flex flex-wrap justify-between gap-2">
                            <span className="font-medium capitalize">
                              {entry.kind === "opening"
                                ? "Opening balance"
                                : entry.kind}
                              {entry.voidedAt != null ? " · Voided" : ""}
                            </span>
                            <span
                              className={
                                entry.voidedAt != null
                                  ? "line-through"
                                  : "font-medium"
                              }
                            >
                              {signed > 0 ? "+" : ""}
                              {accountMoney(signed)}
                            </span>
                          </div>
                          <p className="break-words text-sm">
                            {entry.description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Effective{" "}
                            {new Date(entry.effectiveAt)
                              .toISOString()
                              .slice(0, 10)}{" "}
                            · Recorded{" "}
                            {new Date(entry.createdAt).toLocaleString()}
                          </p>
                          {entry.reference && (
                            <p className="break-words text-xs">
                              Reference: {entry.reference}
                            </p>
                          )}
                          {entry.voidedAt != null ? (
                            <p className="break-words text-sm">
                              Voided {new Date(entry.voidedAt).toLocaleString()}
                              : {entry.voidReason}
                            </p>
                          ) : (
                            entry.kind !== "opening" && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={ledger.pending}
                                onClick={() => {
                                  ledger.setVoidId(entry._id);
                                  ledger.setVoidReason("");
                                }}
                              >
                                Void entry
                              </Button>
                            )
                          )}
                          {ledger.voidId === entry._id && (
                            <form
                              className="space-y-2 border-t pt-3"
                              onSubmit={(event) => {
                                event.preventDefault();
                                void ledger.voidEntry();
                              }}
                            >
                              <p className="text-sm">
                                This reverses the balance impact and preserves
                                the original entry.
                              </p>
                              <label className="block space-y-1 text-sm">
                                Reason for voiding
                                <Input
                                  required
                                  maxLength={500}
                                  value={ledger.voidReason}
                                  disabled={ledger.pending}
                                  onChange={(event) =>
                                    ledger.setVoidReason(event.target.value)
                                  }
                                />
                              </label>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="submit"
                                  variant="destructive"
                                  disabled={ledger.pending}
                                >
                                  Confirm void
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={ledger.pending}
                                  onClick={() => ledger.setVoidId("")}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </form>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {ledger.history.status === "CanLoadMore" && (
                  <Button
                    variant="outline"
                    onClick={() => ledger.history.loadMore(25)}
                  >
                    Load older entries
                  </Button>
                )}
                {ledger.history.status === "LoadingMore" && (
                  <p role="status">Loading older entries…</p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
      <section
        aria-labelledby="league-fees-title"
        className="space-y-4 rounded-lg border p-4"
      >
        <div>
          <h2 id="league-fees-title" className="text-xl font-semibold">
            Annual league fees
          </h2>
          <p className="text-sm text-muted-foreground">
            Calculate charges from each season team’s franchise owner. The
            default league fee is $60 per team.
          </p>
        </div>
        <p className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
          Existing opening balances may already include league fees. Check the
          balances and season before assessing fees; historical fees are never
          added automatically.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            ledger.previewFees();
          }}
        >
          <fieldset
            disabled={ledger.pending}
            className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
          >
            <legend className="sr-only">Fee calculation</legend>
            <label className="block space-y-1 text-sm">
              Season
              <Select
                required
                value={ledger.seasonId}
                onChange={(event) => ledger.changeSeason(event.target.value)}
              >
                <option value="">Choose season</option>
                {ledger.overview.seasons.map((season) => (
                  <option key={season._id} value={season._id}>
                    {season.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block space-y-1 text-sm">
              Fee per team (CAD)
              <Input
                required
                inputMode="decimal"
                value={ledger.feeAmount}
                onChange={(event) => ledger.changeFee(event.target.value)}
              />
            </label>
            <Button type="submit" variant="outline">
              Preview charges
            </Button>
          </fieldset>
        </form>
        {ledger.feePreview &&
          (ledger.preview === undefined ? (
            <p role="status">Calculating fees…</p>
          ) : (
            <div className="space-y-3">
              <h3 className="font-semibold">Fee preview</h3>
              {!ledger.preview.length ? (
                <p>No eligible teams in this season.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {ledger.preview.map((fee) => (
                    <li
                      key={fee.teamId}
                      className="rounded-md border p-3 text-sm"
                    >
                      <p className="font-medium">
                        {fee.ownerName} · {fee.teamName}
                      </p>
                      <p>
                        {fee.assessed
                          ? "Already assessed · no new charge"
                          : `${accountMoney(fee.amountCents)} to charge`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="font-medium">
                {newFees.length} new charges ·{" "}
                {accountMoney(
                  newFees.reduce((total, fee) => total + fee.amountCents, 0),
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Each team is assessed only once per season. Voided fees remain
                assessed and will not be charged again here.
              </p>
              {newFees.length > 0 && (
                <>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={ledger.feesConfirmed}
                      disabled={ledger.pending}
                      onChange={(event) =>
                        ledger.setFeesConfirmed(event.target.checked)
                      }
                    />
                    <span>
                      I have reviewed these charges and checked that the opening
                      balances do not already include these fees.
                    </span>
                  </label>
                  <Button
                    disabled={ledger.pending || !ledger.feesConfirmed}
                    onClick={() => void ledger.assessFees()}
                  >
                    {ledger.pending ? "Assessing…" : "Assess league fees"}
                  </Button>
                </>
              )}
            </div>
          ))}
      </section>
    </div>
  );
}

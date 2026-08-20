"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useSubmitUfaOffer } from "@gshl-hooks";
import { Button } from "@gshl-ui";
import { cn, formatMoney } from "@gshl-utils";
import type { UfaFreeAgentView } from "@gshl-types";

/** A visible, staged binding-offer form shared by UFA cards and tables. */
export function UfaOfferForm({
  player,
  variant = "table",
}: {
  player: UfaFreeAgentView;
  variant?: "card" | "table";
}) {
  const firstAffordableTerm = player.affordableTerms[0] ?? 1;
  const [years, setYears] = useState<number>(firstAffordableTerm);
  const [message, setMessage] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const wasReviewingRef = useRef(false);
  const fieldId = useId();
  const helperId = useId();
  const confirmationId = useId();
  const isCard = variant === "card";
  const mutation = useSubmitUfaOffer({
    onSuccess: () => {
      setIsReviewing(false);
      setIsSubmitted(true);
      setMessage("Binding offer submitted.");
    },
    onError: setMessage,
  });
  const selectedAffordable = player.affordableTerms.includes(
    years as 1 | 2 | 3,
  );

  useEffect(() => {
    if (!player.canOffer) {
      setIsReviewing(false);
    }
    if (!selectedAffordable) {
      setYears(firstAffordableTerm);
      setIsReviewing(false);
    }
  }, [firstAffordableTerm, player.canOffer, selectedAffordable]);

  useEffect(() => {
    if (isSubmitted) {
      statusRef.current?.focus();
    } else if (isReviewing) {
      confirmButtonRef.current?.focus();
    } else if (wasReviewingRef.current && !isSubmitted) {
      reviewButtonRef.current?.focus();
    }
    wasReviewingRef.current = isReviewing;
  }, [isReviewing, isSubmitted]);
  const helperText =
    message ??
    player.disabledReason ??
    (player.existingOffer
      ? "Binding offer submitted."
      : "Salary is reserved while the offer is pending.");

  if (player.existingOffer) {
    return (
      <div
        role="status"
        className={cn(
          "rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left text-xs text-emerald-900",
          isCard ? "w-full" : "min-w-[12rem]",
        )}
      >
        <p className="flex items-center gap-2 font-bold">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Offer submitted
        </p>
        <p className="mt-1">
          {player.existingOffer.years} year
          {player.existingOffer.years === 1 ? "" : "s"} at{" "}
          {formatMoney(player.salary)} per season
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "text-left",
        isCard ? "w-full" : "min-w-[13rem] max-w-[16rem]",
      )}
      aria-busy={mutation.isPending || undefined}
    >
      {isReviewing ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p
            id={confirmationId}
            className="text-xs leading-snug text-amber-950"
          >
            Submit a binding {years}-year offer to{" "}
            <span className="font-bold">{player.fullName}</span> at{" "}
            <span className="font-bold">{formatMoney(player.salary)}</span> per
            season? This salary is reserved while the offer is pending.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 px-2"
              disabled={mutation.isPending}
              onClick={() => setIsReviewing(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              ref={confirmButtonRef}
              className="min-h-11 whitespace-normal px-2 leading-tight"
              disabled={
                !player.canOffer || !selectedAffordable || mutation.isPending
              }
              onClick={() => {
                setMessage(null);
                mutation.mutate({
                  playerId: player.id,
                  contractLength: years as 1 | 2 | 3,
                });
              }}
              aria-label={`Confirm binding ${years}-year offer for ${player.fullName} at ${formatMoney(player.salary)} per season`}
              aria-describedby={`${confirmationId} ${helperId}`}
            >
              {mutation.isPending ? "Submitting…" : "Confirm offer"}
            </Button>
          </div>
        </div>
      ) : (
        <div className={cn("grid gap-2", isCard && "sm:grid-cols-2")}>
          <label htmlFor={fieldId} className="min-w-0">
            <span
              className={cn(
                "mb-1 block text-xs font-semibold text-muted-foreground",
                !isCard && "sr-only",
              )}
            >
              Contract term
            </span>
            <select
              id={fieldId}
              aria-describedby={helperId}
              value={years}
              disabled={!player.canOffer || mutation.isPending || isSubmitted}
              onChange={(event) => {
                setYears(Number(event.target.value));
                setIsReviewing(false);
                setMessage(null);
              }}
              className="min-h-11 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {[1, 2, 3].map((term) => (
                <option
                  key={term}
                  value={term}
                  disabled={!player.affordableTerms.includes(term as 1 | 2 | 3)}
                >
                  {term} year{term === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
          <Button
            ref={reviewButtonRef}
            type="button"
            disabled={
              !player.canOffer ||
              !selectedAffordable ||
              mutation.isPending ||
              isSubmitted
            }
            title={player.disabledReason ?? undefined}
            onClick={() => {
              setMessage(null);
              setIsReviewing(true);
            }}
            className={cn(
              "min-h-11 whitespace-normal px-3 text-sm font-bold leading-tight",
              !isCard && "mt-0",
            )}
            aria-describedby={helperId}
            aria-label={`Review binding offer for ${player.fullName}`}
          >
            Review offer
          </Button>
        </div>
      )}

      <p
        ref={statusRef}
        id={helperId}
        tabIndex={isSubmitted ? -1 : undefined}
        aria-live="polite"
        role={message ? (isSubmitted ? "status" : "alert") : undefined}
        className={cn(
          "mt-2 text-xs leading-snug",
          isSubmitted
            ? "text-emerald-700"
            : message
              ? "text-destructive"
              : "text-muted-foreground",
        )}
      >
        {helperText}
      </p>
    </div>
  );
}

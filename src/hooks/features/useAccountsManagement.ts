"use client";

import { useRef, useState } from "react";
import { useAccounts } from "../main/useAccounts";
import type { AccountEntryKind } from "@gshl-lib/types/accounts";
import {
  accountDate,
  parseAccountAmount,
} from "@gshl-lib/utils/features/accounts";

export function useAccountsManagement() {
  const [ownerId, setOwnerId] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [kind, setKind] = useState<AccountEntryKind>("payment");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  });
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [feeAmount, setFeeAmount] = useState("60.00");
  const [feePreview, setFeePreview] = useState<{
    seasonId: string;
    amountCents: number;
  } | null>(null);
  const [feesConfirmed, setFeesConfirmed] = useState(false);
  const [voidId, setVoidId] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const remote = useAccounts(ownerId, feePreview);
  const owners = remote.overview?.owners ?? [];
  const selectedOwner = owners.find((owner) => owner._id === ownerId);
  const visibleOwners = owners.filter(
    (owner) =>
      `${owner.firstName} ${owner.lastName}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()) &&
      (filter === "all" ||
        (filter === "active" ? owner.isActive : !owner.isActive)),
  );
  const outstanding = owners.reduce(
    (total, owner) => total + Math.max(0, owner.balanceCents),
    0,
  );
  const credits = owners.reduce(
    (total, owner) => total + Math.max(0, -owner.balanceCents),
    0,
  );

  async function run(action: () => Promise<string>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      setMessage(await action());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The operation failed. Please try again.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function record() {
    return run(async () => {
      if (!selectedOwner) throw new Error("Select an owner first.");
      const input = {
        ownerId,
        kind,
        amountCents: parseAccountAmount(amount),
        effectiveAt: accountDate(date),
        description: description.trim(),
        reference: reference.trim() || undefined,
      };
      if (!input.description) throw new Error("Enter a description.");
      const fingerprint = JSON.stringify(input);
      if (request.current?.fingerprint !== fingerprint)
        request.current = { fingerprint, id: crypto.randomUUID() };
      await remote.record({ ...input, requestId: request.current.id });
      request.current = null;
      setAmount("");
      setDescription("");
      setReference("");
      return "Entry recorded.";
    });
  }
  function previewFees() {
    setError("");
    setMessage("");
    setFeesConfirmed(false);
    try {
      if (!seasonId) throw new Error("Choose a season.");
      setFeePreview({ seasonId, amountCents: parseAccountAmount(feeAmount) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid fee amount.");
    }
  }
  function assessFees() {
    return run(async () => {
      if (!feePreview || !feesConfirmed)
        throw new Error("Review and confirm the fee preview first.");
      const result = await remote.assessFees(
        feePreview.seasonId,
        feePreview.amountCents,
      );
      setFeesConfirmed(false);
      return `${result.created} league fee charge${result.created === 1 ? "" : "s"} recorded.`;
    });
  }
  function voidEntry() {
    return run(async () => {
      if (!voidId || !voidReason.trim())
        throw new Error("Enter a reason for voiding this entry.");
      await remote.voidEntry(voidId, voidReason.trim());
      setVoidId("");
      setVoidReason("");
      return "Entry voided; balance updated.";
    });
  }
  function selectOwner(id: string) {
    setOwnerId(id);
    setVoidId("");
    setVoidReason("");
    setAmount("");
    setDescription("");
    setReference("");
    setError("");
    setMessage("");
  }
  function changeSeason(value: string) {
    setSeasonId(value);
    setFeePreview(null);
    setFeesConfirmed(false);
  }
  function changeFee(value: string) {
    setFeeAmount(value);
    setFeePreview(null);
    setFeesConfirmed(false);
  }
  return {
    ...remote,
    ownerId,
    selectOwner,
    selectedOwner,
    visibleOwners,
    outstanding,
    credits,
    search,
    setSearch,
    filter,
    setFilter,
    kind,
    setKind,
    amount,
    setAmount,
    date,
    setDate,
    description,
    setDescription,
    reference,
    setReference,
    seasonId,
    changeSeason,
    feeAmount,
    changeFee,
    feePreview,
    previewFees,
    feesConfirmed,
    setFeesConfirmed,
    assessFees,
    voidId,
    setVoidId,
    voidReason,
    setVoidReason,
    voidEntry,
    record,
    pending,
    error,
    message,
  };
}

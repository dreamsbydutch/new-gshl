"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ArrowRight, BookOpen, X } from "lucide-react";
import { useLatestWeeklyEdition, useWeeklyEdition } from "@gshl-hooks";
import { Skeleton } from "@gshl-ui";
import { WEEKLY_EDITION_LOGO_URL } from "@gshl-utils";
import { WeeklyEditionArticle } from "./WeeklyEditionArticle";

export function WeeklyEditionHomeCard() {
  const { data: edition, isLoading } = useLatestWeeklyEdition();
  const [isOpen, setIsOpen] = useState(false);
  const fullEdition = useWeeklyEdition(isOpen ? (edition?.id ?? "") : "");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    const backgroundElements = [
      document.querySelector<HTMLElement>("#app-content"),
      document.querySelector<HTMLElement>("body > header"),
      document.querySelector<HTMLElement>('body > nav[aria-label="Primary"]'),
      document.querySelector<HTMLElement>('body > a[href="#app-content"]'),
    ].filter((element): element is HTMLElement => element !== null);
    const backgroundState = backgroundElements.map((element) => ({
      element,
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.inert,
    }));
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    const keepFocusInDialog = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = "hidden";
    const initialFocus =
      dialogRef.current?.querySelector<HTMLButtonElement>(
        '[aria-label="Close newsletter"]',
      ) ?? dialogRef.current;
    initialFocus?.focus();
    for (const element of backgroundElements) {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    }
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("keydown", keepFocusInDialog);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("keydown", keepFocusInDialog);
      for (const { element, ariaHidden, inert } of backgroundState) {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      }
      trigger?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || fullEdition.isLoading) return;
    dialogRef.current
      ?.querySelector<HTMLButtonElement>('[aria-label="Close newsletter"]')
      ?.focus();
  }, [fullEdition.isLoading, isOpen]);

  if (isLoading) {
    return (
      <section className="flex h-14 w-full items-center gap-3 border-y border-slate-200 px-3">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </section>
    );
  }
  if (!edition) return null;

  return (
    <>
      <section className="flex w-full items-stretch overflow-hidden border-y border-slate-300 bg-white text-slate-950">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(true)}
          className="group flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500 sm:px-3"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-0.5 shadow-inner">
            <Image
              src={WEEKLY_EDITION_LOGO_URL}
              alt=""
              width={40}
              height={40}
              className="h-full w-full object-contain"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:text-xs">
              Press Box
              <span className="text-slate-400">·</span>
              <span className="truncate text-slate-500">
                {edition.issueLabel}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-[13px] font-semibold leading-5 text-slate-950 sm:text-sm">
              {edition.headline}
            </span>
          </span>
          {edition.heroTeams.length > 0 ? (
            <span className="hidden shrink-0 items-center -space-x-1 sm:flex">
              {edition.heroTeams.map((team) => (
                <span
                  key={team.teamId}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white p-1"
                >
                  <Image
                    src={team.logoUrl}
                    alt=""
                    width={20}
                    height={20}
                    className="h-5 w-5 object-contain"
                  />
                </span>
              ))}
            </span>
          ) : null}
          <span className="inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-xs font-bold text-slate-700 transition group-hover:bg-slate-100 motion-reduce:transition-none">
            Read
            <BookOpen className="h-3 w-3" aria-hidden="true" />
          </span>
        </button>
        <Link
          href="/headlines"
          className="hidden min-h-11 shrink-0 items-center gap-1 border-l border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500 motion-reduce:transition-none sm:flex"
        >
          Archive
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </section>

      {isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] bg-slate-950/70 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] backdrop-blur-sm sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pl-[max(0.75rem,env(safe-area-inset-left))] sm:pr-[max(0.75rem,env(safe-area-inset-right))] sm:pt-[max(0.75rem,env(safe-area-inset-top))]"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setIsOpen(false);
              }}
            >
              <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={`${edition.issueLabel}: ${edition.headline}`}
                aria-busy={fullEdition.isLoading}
                tabIndex={-1}
                className="h-full overflow-y-auto bg-slate-100 outline-none sm:mx-auto sm:max-w-4xl sm:rounded-3xl sm:shadow-2xl"
              >
                {fullEdition.data ? (
                  <WeeklyEditionArticle
                    edition={fullEdition.data}
                    modal
                    onClose={() => setIsOpen(false)}
                  />
                ) : (
                  <div className="min-h-full px-4 py-4 sm:px-8 sm:py-6">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        aria-label="Close newsletter"
                        onClick={() => setIsOpen(false)}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <X className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                    {fullEdition.isLoading ? (
                      <div className="mx-auto mt-8 max-w-3xl space-y-4">
                        <Skeleton className="h-8 w-2/3" />
                        <Skeleton className="h-5 w-full" />
                        <Skeleton className="h-5 w-5/6" />
                        <Skeleton className="mt-8 h-64 w-full rounded-2xl" />
                      </div>
                    ) : (
                      <p className="mx-auto mt-16 max-w-xl text-center text-sm text-slate-600">
                        This Press Box issue is no longer available.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

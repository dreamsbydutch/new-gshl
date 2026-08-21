"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { MoveHorizontal } from "lucide-react";
import type { TableViewportProps } from "@gshl-types";
import { cn } from "@gshl-utils";

/**
 * Shared keyboard- and touch-scrollable frame for tables wider than their page.
 * Edge fades and a concise hint make hidden columns discoverable.
 */
export const TableViewport = forwardRef<HTMLDivElement, TableViewportProps>(
  function TableViewport(
    {
      children,
      ariaLabel,
      className,
      viewportClassName,
      scrollHint = "Scroll for more columns",
    },
    forwardedRef,
  ) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const descriptionId = useId();
    const [scrollState, setScrollState] = useState({
      isOverflowing: false,
      canScrollLeft: false,
      canScrollRight: false,
    });

    const updateScrollState = useCallback(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const maxScrollLeft = Math.max(
        0,
        viewport.scrollWidth - viewport.clientWidth,
      );
      const nextState = {
        isOverflowing: maxScrollLeft > 2,
        canScrollLeft: viewport.scrollLeft > 2,
        canScrollRight: viewport.scrollLeft < maxScrollLeft - 2,
      };

      setScrollState((current) =>
        current.isOverflowing === nextState.isOverflowing &&
        current.canScrollLeft === nextState.canScrollLeft &&
        current.canScrollRight === nextState.canScrollRight
          ? current
          : nextState,
      );
    }, []);

    useImperativeHandle(forwardedRef, () => viewportRef.current!, []);

    useEffect(() => {
      updateScrollState();
      const viewport = viewportRef.current;
      if (!viewport) return;

      const observer =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(updateScrollState);
      observer?.observe(viewport);
      const table = viewport.querySelector("table");
      if (table) observer?.observe(table);
      window.addEventListener("resize", updateScrollState);
      return () => {
        observer?.disconnect();
        window.removeEventListener("resize", updateScrollState);
      };
    }, [updateScrollState]);

    return (
      <div className={cn("relative min-w-0 max-w-full", className)}>
        <div className="relative min-w-0 max-w-full">
          <div
            ref={viewportRef}
            role={scrollState.isOverflowing ? "region" : undefined}
            aria-label={scrollState.isOverflowing ? ariaLabel : undefined}
            aria-describedby={
              scrollState.isOverflowing ? descriptionId : undefined
            }
            tabIndex={scrollState.isOverflowing ? 0 : undefined}
            onScroll={updateScrollState}
            className={cn(
              "relative block w-full min-w-0 max-w-full touch-auto overflow-x-auto overscroll-x-contain rounded-lg border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              viewportClassName,
            )}
          >
            {children}
          </div>

          {scrollState.canScrollLeft ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-0 top-0 z-40 w-8 rounded-l-lg bg-gradient-to-r from-slate-900/15 to-transparent"
            />
          ) : null}
          {scrollState.canScrollRight ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 right-0 top-0 z-40 w-8 rounded-r-lg bg-gradient-to-l from-slate-900/15 to-transparent"
            />
          ) : null}
        </div>

        {scrollState.isOverflowing ? (
          <p
            id={descriptionId}
            className="mt-1 flex min-h-5 items-center justify-end gap-1 px-1 text-xs font-medium text-muted-foreground"
          >
            <MoveHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            {scrollHint}
          </p>
        ) : null}
      </div>
    );
  },
);

TableViewport.displayName = "TableViewport";

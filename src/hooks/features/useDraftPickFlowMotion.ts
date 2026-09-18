"use client";

import { useLayoutEffect, useRef } from "react";

/** Keep keyed picks moving toward/from the on-clock header as live data updates. */
export function useDraftPickFlowMotion(recent: boolean) {
  const listRef = useRef<HTMLOListElement>(null);
  const positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const next = new Map<string, number>();
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const animations: Animation[] = [];
    for (const item of list.querySelectorAll<HTMLElement>("[data-pick-id]")) {
      const id = item.dataset.pickId!;
      const top = item.offsetTop;
      const previous = positions.current.get(id);
      next.set(id, top);
      if (reducedMotion || !positions.current.size) continue;
      const offset =
        previous === undefined ? (recent ? -24 : 24) : previous - top;
      if (offset)
        animations.push(
          item.animate(
            [
              {
                transform: `translateY(${offset}px)`,
                opacity: previous === undefined ? 0 : 1,
              },
              { transform: "translateY(0)", opacity: 1 },
            ],
            { duration: 450, easing: "ease-out" },
          ),
        );
    }
    positions.current = next;
    return () => animations.forEach((animation) => animation.cancel());
  });
  return { listRef };
}

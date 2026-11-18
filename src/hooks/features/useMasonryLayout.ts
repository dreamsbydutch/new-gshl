"use client";

import { useLayoutEffect, useRef } from "react";

/** Size grid rows from card contents, keeping DOM and keyboard order intact. */
export function useMasonryLayout() {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid || typeof ResizeObserver === "undefined") return;
    const items = Array.from(grid.children) as HTMLElement[];
    let frame = 0;
    const measure = () => {
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      for (const item of items) {
        const content = item.firstElementChild;
        if (!content) continue;
        item.style.gridRowEnd = `span ${Math.max(1, Math.ceil(content.getBoundingClientRect().height + gap))}`;
      }
      grid.dataset.masonry = "ready";
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    for (const item of items) {
      if (item.firstElementChild) observer.observe(item.firstElementChild);
    }
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });

  return ref;
}

"use client";

import { useLayoutEffect, useRef } from "react";

/** Fit a complete roster/table inside its panel without clipping or scrolling. */
export function useDraftBoardFit() {
  const panelRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const content = contentRef.current;
    if (!panel || !content) return;

    const fit = () => {
      content.style.fontSize = "";
      const preferred = Number.parseFloat(getComputedStyle(content).fontSize);
      // Measure real rendered names and stats, including wrapped surnames.
      // Start fresh each time so text can grow again on a larger display.
      let size = preferred;
      while (
        size > 4 &&
        (content.scrollHeight > panel.clientHeight ||
          content.scrollWidth > panel.clientWidth)
      ) {
        size -= 0.25;
        content.style.fontSize = `${size}px`;
      }
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(panel);
    const changes = new MutationObserver(fit);
    changes.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) fit();
    });
    return () => {
      active = false;
      resize.disconnect();
      changes.disconnect();
    };
  });

  return { panelRef, contentRef };
}

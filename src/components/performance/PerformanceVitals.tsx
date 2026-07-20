"use client";

import { useEffect, useRef } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { useAppPathname } from "@gshl-hooks";

const NAVIGATION_MARK = "gshl-navigation-start";

/** Development-only Core Web Vitals and client-navigation diagnostics. */
export function PerformanceVitals() {
  const pathname = useAppPathname();
  const previousPathname = useRef(pathname);

  useReportWebVitals((metric: unknown) => {
    if (process.env.NODE_ENV === "development") {
      console.info("[Web Vital]", metric, {
        path: window.location.pathname,
      });
    }
  });

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const markNavigationStart = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      performance.mark(NAVIGATION_MARK);
    };

    document.addEventListener("click", markNavigationStart, { capture: true });
    return () =>
      document.removeEventListener("click", markNavigationStart, {
        capture: true,
      });
  }, []);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "development" ||
      previousPathname.current === pathname
    ) {
      return;
    }

    previousPathname.current = pathname;
    const starts = performance.getEntriesByName(NAVIGATION_MARK, "mark");
    const start = starts.at(-1);
    if (!start) return;

    console.info("[Navigation]", {
      path: pathname,
      durationMs: Math.round(performance.now() - start.startTime),
    });
    performance.clearMarks(NAVIGATION_MARK);
  }, [pathname]);

  return null;
}

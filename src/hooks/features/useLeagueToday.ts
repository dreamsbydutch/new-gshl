"use client";
import { useEffect, useState } from "react";
import { getTorontoDate } from "@gshl-utils/domain/contracts";
export function useLeagueToday(
  formatDate: (date: Date) => string = getTorontoDate,
) {
  const [today, setToday] = useState(() => formatDate(new Date()));
  useEffect(() => {
    const refresh = () => setToday(formatDate(new Date()));
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [formatDate]);
  return today;
}

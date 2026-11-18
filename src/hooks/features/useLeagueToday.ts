"use client";
import { useEffect, useState } from "react";
import { getTorontoDate } from "@gshl-utils/domain/contracts";
export function useLeagueToday() {
  const [today, setToday] = useState(() => getTorontoDate());
  useEffect(() => {
    const refresh = () => setToday(getTorontoDate());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return today;
}

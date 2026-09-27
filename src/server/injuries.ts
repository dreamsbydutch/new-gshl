import "server-only";
import { unstable_cache } from "next/cache";
import {
  INJURY_REFRESH_MS,
  parseEspnInjuries,
} from "@gshl-utils/features/injuries";

export const getInjuryReport = unstable_cache(
  async () => {
    const response = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries",
      { cache: "no-store", signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok)
      throw new Error(`ESPN injury feed: HTTP ${response.status}`);
    const payload: unknown = await response.json();
    return parseEspnInjuries(payload);
  },
  ["espn-nhl-injuries-v2"],
  { revalidate: INJURY_REFRESH_MS / 1000 },
);

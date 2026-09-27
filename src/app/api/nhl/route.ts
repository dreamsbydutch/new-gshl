import { NextResponse } from "next/server";
import {
  NHL_STANDINGS_REFRESH_SECONDS,
  NHL_SCHEDULE_REFRESH_SECONDS,
  isNHLSeasonId,
} from "@gshl-utils/features/nhl";
import {
  getNHLSchedule,
  getNHLStandings,
  nhlDateRange,
} from "@gshl-server/nhl";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const view = params.get("view");
  const seasonId = Number(params.get("season"));
  if (!isNHLSeasonId(seasonId)) {
    return NextResponse.json({ error: "Invalid NHL season" }, { status: 400 });
  }
  if (view !== "standings" && view !== "schedule") {
    return NextResponse.json({ error: "Invalid NHL view" }, { status: 400 });
  }
  let dates: string[] = [];
  if (view === "schedule") {
    try {
      dates = nhlDateRange(params.get("start") ?? "", params.get("end") ?? "");
    } catch {
      return NextResponse.json(
        { error: "Invalid schedule date range" },
        { status: 400 },
      );
    }
  }
  try {
    const data =
      view === "standings"
        ? await getNHLStandings(seasonId)
        : await getNHLSchedule(seasonId, dates);
    const interval =
      view === "standings"
        ? NHL_STANDINGS_REFRESH_SECONDS
        : NHL_SCHEDULE_REFRESH_SECONDS;
    // CDN hits avoid invoking a server function for each visitor.
    const remaining = interval - (Math.floor(Date.now() / 1000) % interval);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": `public, max-age=0, s-maxage=${remaining}`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "NHL data is temporarily unavailable. Please try again." },
      { status: 502 },
    );
  }
}

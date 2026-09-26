import { NextResponse } from "next/server";
import {
  getNHLSchedule,
  getNHLStandings,
  nhlDateRange,
} from "@gshl-server/nhl";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const view = params.get("view");
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
        ? await getNHLStandings()
        : await getNHLSchedule(dates);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "NHL data is temporarily unavailable. Please try again." },
      { status: 502 },
    );
  }
}

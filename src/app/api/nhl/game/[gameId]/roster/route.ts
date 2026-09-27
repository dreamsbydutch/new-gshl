import { NextResponse } from "next/server";
import { getNHLMatchupRoster } from "@gshl-server/nhl-matchup";
import { NHL_SCHEDULE_REFRESH_SECONDS } from "@gshl-utils/features/nhl";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await params;
  if (!/^\d{10}$/.test(gameId))
    return NextResponse.json({ error: "Invalid NHL game" }, { status: 400 });
  try {
    const roster = await getNHLMatchupRoster(gameId);
    if (!roster)
      return NextResponse.json(
        { error: "NHL game not found" },
        { status: 404 },
      );
    const remaining =
      NHL_SCHEDULE_REFRESH_SECONDS -
      (Math.floor(Date.now() / 1000) % NHL_SCHEDULE_REFRESH_SECONDS);
    return NextResponse.json(roster, {
      headers: { "Cache-Control": `public, max-age=0, s-maxage=${remaining}` },
    });
  } catch {
    return NextResponse.json(
      { error: "GSHL roster data is temporarily unavailable" },
      { status: 502 },
    );
  }
}

import { NextResponse } from "next/server";
import { getMatchupRecords } from "@gshl-server/performance-records";

export const maxDuration = 60;
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ matchupId: string }> },
) {
  const { matchupId } = await params;
  if (!/^[a-z0-9]{20,40}$/.test(matchupId))
    return NextResponse.json({ error: "Invalid matchup" }, { status: 400 });
  try {
    return NextResponse.json(await getMatchupRecords(matchupId));
  } catch {
    return NextResponse.json(
      { error: "Historical comparison unavailable" },
      { status: 503 },
    );
  }
}

import { NextResponse } from "next/server";
import { getNhlOrganizations } from "@gshl-server/nhl";
import { NHL_ORGANIZATION_REFRESH_SECONDS } from "@gshl-utils/features/nhl-organizations";
import { isNHLSeasonId } from "@gshl-utils/features/nhl";

export const maxDuration = 120;

export async function GET(request: Request) {
  const seasonId = Number(new URL(request.url).searchParams.get("season"));
  const now = new Date();
  const year = now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 1 : 0);
  if (!isNHLSeasonId(seasonId) || seasonId !== year * 10000 + year + 1)
    return NextResponse.json(
      { error: "Current NHL season required" },
      { status: 400 },
    );
  try {
    return NextResponse.json(await getNhlOrganizations(seasonId), {
      headers: {
        "Cache-Control": `public, max-age=0, s-maxage=${NHL_ORGANIZATION_REFRESH_SECONDS}`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "NHL organization rosters are temporarily unavailable" },
      { status: 502 },
    );
  }
}

import { NextResponse } from "next/server";
import { getInjuryReport } from "@gshl-server/injuries";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getInjuryReport(), {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=60" },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "ESPN injury updates are temporarily unavailable. Please try again later.",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

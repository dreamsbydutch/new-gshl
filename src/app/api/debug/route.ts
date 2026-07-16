import { env } from "@gshl-env";
import { getMany } from "@gshl-api/sheets-store";
import type { Season } from "@gshl-types";
import { NextResponse } from "next/server";

function safeHost(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return "invalid";
  }
}

export async function GET() {
  try {
    const convexUrl = env.CONVEX_URL ?? env.NEXT_PUBLIC_CONVEX_URL;
    const data: Record<string, unknown> = {
      backend: env.GSHL_DATA_BACKEND,
      convexHost: safeHost(convexUrl),
      hasConvexUrl: Boolean(convexUrl),
    };

    if (env.GSHL_DATA_BACKEND === "convex") {
      const seasons = await getMany<Season>("Season", { take: 1 });
      data.convexHealth = {
        seasonRows: seasons.length,
        sampleSeasonId: seasons[0]?.id ?? null,
      };
    } else {
      const { optimizedSheetsClient } = await import("@gshl-sheets");
      data.queueStatus = optimizedSheetsClient.getQueueStatus();
    }

    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting debug info:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

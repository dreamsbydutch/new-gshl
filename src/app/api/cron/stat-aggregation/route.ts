/**
 * Manual Stat Aggregation API Endpoint
 *
 * POST /api/cron/stat-aggregation
 *
 * Manually triggers stat aggregation for a specific date.
 * Useful for testing, backfilling, or re-processing stats.
 *
 * Body:
 * {
 *   "date": "2025-01-15"  // ISO date string (optional, defaults to yesterday)
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "result": { ... aggregation result ... }
 * }
 */

import { type NextRequest, NextResponse } from "next/server";
import { manualStatAggregation } from "../../../../server/cron/stat-aggregation-job";

interface StatAggregationRequestBody {
  date?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as StatAggregationRequestBody;
    const dateStr = body.date;

    // Parse date or default to yesterday
    const date = dateStr
      ? new Date(dateStr)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    if (isNaN(date.getTime())) {
      return NextResponse.json(
        { success: false, error: "Invalid date format" },
        { status: 400 },
      );
    }

    console.log(
      `🔧 [API] Manual stat aggregation requested for ${date.toISOString().split("T")[0]}`,
    );

    const result = await manualStatAggregation(date);

    return NextResponse.json({
      success: true,
      result: {
        date: result.date.toISOString().split("T")[0],
        weekId: result.weekId,
        seasonId: result.seasonId,
        totalRecordsUpdated: result.totalRecordsUpdated,
        breakdown: result.breakdown,
        elapsedMs: result.elapsedMs,
        errors: result.errors,
      },
    });
  } catch (error) {
    console.error("[API] Stat aggregation error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

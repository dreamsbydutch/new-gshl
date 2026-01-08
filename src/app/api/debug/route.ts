import { optimizedSheetsClient } from "@gshl-sheets";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      data: {
        queueStatus: optimizedSheetsClient.getQueueStatus(),
      },
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

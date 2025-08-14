import { optimizedSheetsAdapter } from "@gshl-sheets";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const debugInfo = optimizedSheetsAdapter.getDebugInfo();

    return NextResponse.json({
      success: true,
      data: debugInfo,
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

/**
 * Cache Invalidation API Endpoint
 *
 * Provides server-side cache invalidation triggers
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

interface InvalidationRequest {
  hardReset?: boolean;
  invalidateTables?: string[];
  token?: string; // Optional security token
}

export async function GET(_request: NextRequest) {
  try {
    // In a real implementation, you might check authentication here
    // const token = request.headers.get('authorization');
    // if (!token || !validateToken(token)) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    // For now, return a simple status
    return NextResponse.json({
      status: "ok",
      timestamp: Date.now(),
      // hardReset: false, // Set to true if a hard reset is needed
      // invalidateTables: [], // List tables that should be invalidated
    });
  } catch (error) {
    console.error("Cache invalidation check failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as unknown as InvalidationRequest;

    // Define valid tables for invalidation
    const INVALIDATION_CONFIG = {
      INVALIDATABLE_TABLES: [
        "playerStats",
        "teamStats",
        // Add other valid table names here
      ],
    };

    if (body.invalidateTables) {
      const validTables = INVALIDATION_CONFIG.INVALIDATABLE_TABLES;
      const invalidTables = body.invalidateTables.filter(
        (table) => !validTables.includes(table),
      );

      if (invalidTables.length > 0) {
        return NextResponse.json(
          { error: `Invalid tables: ${invalidTables.join(", ")}` },
          { status: 400 },
        );
      }
    }

    // In a real implementation, you might:
    // 1. Store the invalidation request in a database
    // 2. Broadcast to all connected clients via WebSocket
    // 3. Update a cache invalidation timestamp

    // For now, just echo back the request
    return NextResponse.json({
      status: "success",
      timestamp: Date.now(),
      hardReset: body.hardReset ?? false,
      invalidateTables: body.invalidateTables ?? [],
      message: "Cache invalidation request processed",
    });
  } catch (error) {
    console.error("Cache invalidation request failed:", error);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// Example usage:
// POST /api/cache/invalidation
// {
//   "hardReset": false,
//   "invalidateTables": ["playerStats", "teamStats"]
// }

import { NextResponse } from "next/server";
import { getConvexJwks } from "@gshl-lib/auth/convex-token";

export function GET() {
  return NextResponse.json(getConvexJwks(), {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}

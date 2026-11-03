import { NextResponse } from "next/server";
import { auth } from "@gshl-auth";
import { createConvexAccessToken } from "@gshl-lib/auth/convex-token";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id || session.user.status !== "active") {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    {
      token: createConvexAccessToken(session.user.id),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

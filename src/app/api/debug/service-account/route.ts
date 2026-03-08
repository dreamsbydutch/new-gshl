import { NextResponse } from "next/server";
import { env } from "../../../../env";

export async function GET() {
  try {
    if (!env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      return NextResponse.json(
        {
          error:
            "GOOGLE_SERVICE_ACCOUNT_KEY is not set. File-based credentials mode is active.",
        },
        { status: 400 },
      );
    }

    // Decode the base64 service account key
    const serviceAccountKey = JSON.parse(
      Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_KEY, "base64").toString("utf-8"),
    ) as { client_email: string };

    return NextResponse.json({
      email: serviceAccountKey.client_email,
    });
  } catch (error) {
    console.error("Error reading service account:", error);
    return NextResponse.json(
      { error: "Failed to read service account" },
      { status: 500 },
    );
  }
}

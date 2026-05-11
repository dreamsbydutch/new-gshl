export async function runAppsScriptFunction<T>(
  functionName: string,
  payload: unknown,
): Promise<T> {
  const { env } = await import("@gshl-env");

  if (!env.GOOGLE_APPS_SCRIPT_ID || !env.GOOGLE_APPS_SCRIPT_ACCESS_TOKEN) {
    throw new Error(
      "[apps-script-execution] GOOGLE_APPS_SCRIPT_ID and GOOGLE_APPS_SCRIPT_ACCESS_TOKEN are required for live Apps Script parity checks.",
    );
  }

  const response = await fetch(
    `https://script.googleapis.com/v1/scripts/${env.GOOGLE_APPS_SCRIPT_ID}:run`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GOOGLE_APPS_SCRIPT_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        function: functionName,
        parameters: [payload],
        devMode: true,
      }),
    },
  );

  const body = (await response.json()) as {
    response?: { result?: T };
    error?: {
      message?: string;
      details?: Array<{ errorMessage?: string }>;
    };
  };

  if (!response.ok || body.error) {
    const detailMessage = body.error?.details?.find(
      (detail) => detail.errorMessage,
    )?.errorMessage;
    throw new Error(
      detailMessage ??
        body.error?.message ??
        `[apps-script-execution] Apps Script request failed with status ${response.status}.`,
    );
  }

  if (!body.response) {
    throw new Error(
      "[apps-script-execution] Apps Script returned no response payload.",
    );
  }

  return body.response.result as T;
}

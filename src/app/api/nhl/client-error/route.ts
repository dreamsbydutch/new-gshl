import { auth } from "@gshl-auth";
import { z } from "zod";
import { sanitizeNhlExplorerErrorText } from "@gshl-utils/features/nhl-explorer-error";
import {
  readLimitedRequestText,
  RequestBodyError,
} from "@gshl-utils/core/request-body";

const payload = z
  .object({
    name: z.string().max(1500),
    message: z.string().max(1500),
    stack: z.string().max(1500),
    view: z.enum(["teams", "players", "contracts"]),
    kind: z.enum(["chunk", "render"]),
  })
  .strict();
const attempts = new Map<string, number>();

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    return new Response(null, { status: 403 });
  const session = await auth();
  if (session?.user.status !== "active")
    return new Response(null, { status: 401 });
  const key = session.user.id;
  const now = Date.now();
  if (now - (attempts.get(key) ?? 0) < 10_000)
    return new Response(null, { status: 429 });
  if (attempts.size > 500) attempts.clear();
  attempts.set(key, now);
  let data: z.infer<typeof payload>;
  try {
    const text = await readLimitedRequestText(request, 8192);
    data = payload.parse(JSON.parse(text));
  } catch (error) {
    return new Response(null, {
      status: error instanceof RequestBodyError ? error.status : 400,
    });
  }
  console.error(
    "[nhl-explorer-client-error]",
    JSON.stringify({
      ...data,
      name: sanitizeNhlExplorerErrorText(data.name),
      message: sanitizeNhlExplorerErrorText(data.message),
      stack: sanitizeNhlExplorerErrorText(data.stack),
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local",
    }),
  );
  return new Response(null, { status: 204 });
}

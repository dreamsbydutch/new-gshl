import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();
const cookieName = "__Host-gshl-yahoo";
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

http.route({
  path: "/yahoo/connect",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const ticket = new URL(request.url).searchParams.get("ticket") ?? "";
      const result = await ctx.runAction(
        internal.yahoo.startBrowserConnection,
        { ticket },
      );
      if (result)
        return new Response(null, {
          status: 302,
          headers: {
            ...headers,
            Location: result.url,
            "Set-Cookie": `${cookieName}=${result.browserToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
          },
        });
    } catch {
      /* Keep authenticated provider errors out of the public response. */
    }
    return new Response(
      "This connection link expired or was already used. Generate a new link in Convex.",
      { status: 400, headers },
    );
  }),
});

http.route({
  path: "/yahoo/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    let connected = false;
    try {
      const params = new URL(request.url).searchParams;
      const browserToken =
        request.headers
          .get("Cookie")
          ?.split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith(`${cookieName}=`))
          ?.slice(cookieName.length + 1) ?? "";
      connected = await ctx.runAction(internal.yahoo.finishConnection, {
        state: params.get("state") ?? "",
        browserToken,
        code: params.has("error")
          ? undefined
          : (params.get("code") ?? undefined),
      });
    } catch {
      /* Never echo codes, tokens, Yahoo bodies, or exception details. */
    }
    return new Response(null, {
      status: 303,
      headers: {
        ...headers,
        Location: `/yahoo/result?status=${connected ? "connected" : "failed"}`,
        "Set-Cookie": `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      },
    });
  }),
});

http.route({
  path: "/yahoo/result",
  method: "GET",
  handler: httpAction(
    async (_ctx, request) =>
      new Response(
        new URL(request.url).searchParams.get("status") === "connected"
          ? "Yahoo authorization saved. You can close this tab. Run the connection check in Convex to verify league access."
          : "Yahoo was not connected. Generate a new connection link in Convex and try again. Check that the Yahoo callback URL matches this deployment.",
        {
          headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
        },
      ),
  ),
});

export default http;

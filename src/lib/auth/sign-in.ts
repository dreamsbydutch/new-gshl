import "server-only";

import { headers } from "next/headers";
import { auth, signIn } from "@gshl-auth";
import { env } from "@gshl-env";
import { resolveRequestCallbackPath } from "@gshl-utils/core/auth-callback";

export async function prepareSignIn(callbackUrl?: string) {
  const destination = resolveRequestCallbackPath(callbackUrl, await headers());
  const isOAuthConfigured = Boolean(
    env.AUTH_SECRET &&
    env.AUTH_GOOGLE_ID &&
    env.AUTH_GOOGLE_SECRET &&
    env.CONVEX_SERVER_SECRET,
  );
  const session = env.AUTH_SECRET ? await auth() : null;

  async function signInAction() {
    "use server";
    await signIn("google", { redirectTo: destination });
  }

  return {
    destination,
    isActiveUser: session?.user.status === "active",
    isOAuthConfigured,
    signInAction,
  };
}

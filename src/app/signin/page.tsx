import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth, signIn } from "@gshl-auth";
import type { SignInPageProps } from "@gshl-types";
import { env } from "@gshl-env";
import { SignInContent } from "@gshl-components/auth/SignInContent";
import { resolveSafeCallbackPath } from "@gshl-utils";

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { callbackUrl, error } = await searchParams;
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = (forwardedHost ?? requestHeaders.get("host"))
    ?.split(",")[0]
    ?.trim();
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol =
    forwardedProtocol ?? (host?.startsWith("localhost") ? "http" : "https");
  const destination = resolveSafeCallbackPath(
    callbackUrl,
    host ? `${protocol}://${host}` : null,
  );
  const isOAuthConfigured = Boolean(
    env.AUTH_SECRET &&
      env.AUTH_GOOGLE_ID &&
      env.AUTH_GOOGLE_SECRET &&
      env.CONVEX_SERVER_SECRET,
  );
  const session = env.AUTH_SECRET ? await auth() : null;

  if (session?.user.status === "active") redirect(destination);

  async function signInAction() {
    "use server";
    await signIn("google", { redirectTo: destination });
  }

  return (
    <SignInContent
      error={error}
      isOAuthConfigured={isOAuthConfigured}
      signInAction={signInAction}
    />
  );
}

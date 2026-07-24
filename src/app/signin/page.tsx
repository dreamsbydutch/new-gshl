import { redirect } from "next/navigation";
import { auth, signIn } from "@gshl-auth";
import type { SignInPageProps } from "@gshl-types";
import { env } from "@gshl-env";
import { SignInContent } from "@gshl-components/auth/SignInContent";

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { callbackUrl, error } = await searchParams;
  const destination =
    callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : "/lockerroom";
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

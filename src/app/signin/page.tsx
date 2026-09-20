import { redirect } from "next/navigation";
import type { SignInPageProps } from "@gshl-types";
import { SignInContent } from "@gshl-components/auth/SignInContent";
import { prepareSignIn } from "@gshl-lib/auth/sign-in";

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { callbackUrl, error } = await searchParams;
  const { destination, isActiveUser, isOAuthConfigured, signInAction } =
    await prepareSignIn(callbackUrl);

  if (isActiveUser) redirect(destination);

  return (
    <SignInContent
      error={error}
      isOAuthConfigured={isOAuthConfigured}
      signInAction={signInAction}
    />
  );
}

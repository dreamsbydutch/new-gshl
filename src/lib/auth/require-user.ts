import "server-only";

import { redirect } from "next/navigation";
import { auth } from "@gshl-auth";
import { env } from "@gshl-env";

export async function requireActiveUser(returnTo: string) {
  if (!env.AUTH_SECRET) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(returnTo)}`);
  }
  const session = await auth();
  if (session?.user.status !== "active") {
    redirect(`/signin?callbackUrl=${encodeURIComponent(returnTo)}`);
  }
  return session.user;
}

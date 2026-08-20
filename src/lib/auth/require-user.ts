import "server-only";

import { redirect } from "next/navigation";
import { auth } from "@gshl-auth";
import { env } from "@gshl-env";
import type { RouteSearchParams } from "@gshl-types";
import { buildInternalCallbackPath } from "@gshl-utils";

export async function requireActiveUser(
  pathname: string,
  searchParams: RouteSearchParams = {},
) {
  const returnTo = buildInternalCallbackPath(pathname, searchParams);
  if (!env.AUTH_SECRET) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(returnTo)}`);
  }
  const session = await auth();
  if (session?.user.status !== "active") {
    redirect(`/signin?callbackUrl=${encodeURIComponent(returnTo)}`);
  }
  return session.user;
}

import { requireActiveUser } from "@gshl-lib/auth/require-user";
import type { ProtectedRoutePageProps } from "@gshl-types";
import { buildInternalCallbackPath } from "@gshl-utils";
import { redirect } from "next/navigation";

export default async function DraftBoardPage({
  searchParams,
}: ProtectedRoutePageProps) {
  const query = await searchParams;
  await requireActiveUser("/draftboard", query);
  redirect(buildInternalCallbackPath("/draft", query));
}

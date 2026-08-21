import { DraftHubBoard } from "@gshl-components/draft/DraftHubBoard";
import { requireActiveUser } from "@gshl-lib/auth/require-user";
import type { ProtectedRoutePageProps } from "@gshl-types";

export default async function DraftPage({
  searchParams,
}: ProtectedRoutePageProps) {
  await requireActiveUser("/draft", await searchParams);
  return <DraftHubBoard />;
}

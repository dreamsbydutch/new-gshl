import { RecordsContent } from "@gshl-components/league/RecordsContent";
import { requireActiveUser } from "@gshl-lib/auth/require-user";
import type { ProtectedRoutePageProps } from "@gshl-types";

export const metadata = { title: "GSHL records" };

export default async function RecordsPage({
  searchParams,
}: ProtectedRoutePageProps) {
  await requireActiveUser("/records", await searchParams);
  return <RecordsContent />;
}

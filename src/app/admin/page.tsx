import { redirect } from "next/navigation";
import { AdminContent } from "@gshl-components/admin";
import { requireActiveUser } from "@gshl-lib/auth/require-user";
import type { ProtectedRoutePageProps } from "@gshl-types";

export default async function AdminPage({
  searchParams,
}: ProtectedRoutePageProps) {
  const params = await searchParams;
  const user = await requireActiveUser("/admin", params);
  if (user.role !== "commissioner") redirect("/leagueoffice");
  return <AdminContent />;
}

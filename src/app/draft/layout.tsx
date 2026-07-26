import { DraftHubLayout } from "@gshl-components/draft/DraftHubLayout";
import { requireActiveUser } from "@gshl-lib/auth/require-user";

export default async function DraftLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireActiveUser("/draft");
  return <DraftHubLayout>{children}</DraftHubLayout>;
}

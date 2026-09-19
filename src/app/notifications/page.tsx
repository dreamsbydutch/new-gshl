import { NotificationCenter } from "@gshl-components/notifications/NotificationCenter";
import { requireActiveUser } from "@gshl-lib/auth/require-user";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";
export default async function NotificationsPage() {
  await requireActiveUser("/notifications");
  return <NotificationCenter />;
}

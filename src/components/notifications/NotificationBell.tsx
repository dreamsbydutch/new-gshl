"use client";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useNotificationCount } from "@gshl-hooks/main/useNotifications";

export function NotificationBell() {
  const { count } = useNotificationCount();
  return (
    <Link
      href="/notifications"
      aria-label={`Notifications${count ? `, ${count >= 100 ? "99+" : count} unread` : ""}`}
      title="Notifications"
      className="relative grid min-h-11 min-w-11 place-items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
    >
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute right-0 top-0 rounded-full bg-slate-700 px-1 text-[10px] text-white">
          {count >= 100 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { LogIn, LogOut } from "lucide-react";

export function AuthNavControl() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div className="h-9 w-9 animate-pulse rounded-full bg-gray-300" />;
  }

  if (!session?.user) {
    return (
      <Link
        href="/signin"
        className="flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs font-semibold shadow-sm hover:bg-gray-50"
      >
        <LogIn className="h-4 w-4" />
        <span>Sign in</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border bg-white px-2 py-1 shadow-sm">
      <div
        aria-label={`${session.user.name ?? "User"} avatar`}
        className="h-7 w-7 rounded-full bg-gray-200 bg-cover bg-center"
        style={
          session.user.image
            ? { backgroundImage: `url(${session.user.image})` }
            : undefined
        }
      />
      <div className="hidden min-w-0 text-left xl:block">
        <div className="max-w-28 truncate text-xs font-semibold">
          {session.user.name ?? session.user.email}
        </div>
        <div className="text-[10px] capitalize text-muted-foreground">
          {session.user.role}
        </div>
      </div>
      <button
        type="button"
        aria-label="Sign out"
        title="Sign out"
        onClick={() => void signOut({ redirectTo: "/" })}
        className="rounded p-1 text-gray-600 hover:bg-gray-100"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

"use client";

import Link from "next/link";
import { LogIn, LogOut } from "lucide-react";
import { useAuthActions, useAuthSession } from "@gshl-hooks";
import { Skeleton } from "@gshl-ui";
import type { AuthNavControlProps } from "@gshl-types";
import { cn } from "@gshl-utils";

export function AuthNavControl({ compact = false }: AuthNavControlProps) {
  const { session, status } = useAuthSession();
  const { signOut } = useAuthActions();

  if (status === "loading") {
    return <Skeleton className="h-11 w-11 rounded-full bg-gray-300" />;
  }

  if (!session?.user) {
    return (
      <Link
        href="/signin"
        className={cn(
          "flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 motion-reduce:transition-none",
          compact &&
            "border-slate-700 bg-slate-900 px-2 text-white shadow-none hover:bg-slate-800 focus-visible:ring-white focus-visible:ring-offset-slate-950",
        )}
      >
        <LogIn className="h-4 w-4" />
        <span className={compact ? "sr-only" : undefined}>Sign in</span>
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-11 items-center gap-1 rounded-lg border bg-white px-1.5 shadow-sm",
        compact && "gap-0 border-0 bg-transparent px-0 shadow-none",
      )}
    >
      <div
        role="img"
        aria-label={`${session.user.name ?? "User"} avatar`}
        className="h-8 w-8 rounded-full bg-gray-200 bg-cover bg-center"
        style={
          session.user.image
            ? { backgroundImage: `url(${session.user.image})` }
            : undefined
        }
      />
      <div
        className={cn("hidden min-w-0 text-left xl:block", compact && "hidden")}
      >
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
        onClick={() => void signOut()}
        className={cn(
          "grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 motion-reduce:transition-none",
          compact && "text-white hover:bg-slate-800 focus-visible:ring-white",
        )}
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

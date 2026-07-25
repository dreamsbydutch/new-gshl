"use client";

import { useCallback } from "react";
import { signOut, useSession } from "next-auth/react";

export function useAuthSession() {
  const { data: session, status, update } = useSession();

  return {
    session,
    status,
    update,
  };
}

export function useAuthActions() {
  const signOutUser = useCallback(() => signOut({ redirectTo: "/" }), []);

  return {
    signOut: signOutUser,
  };
}

export function useConvexAuth() {
  const { session, status } = useAuthSession();
  const isAuthenticated =
    status === "authenticated" && session?.user.status === "active";

  const fetchAccessToken = useCallback(async () => {
    if (!isAuthenticated) return null;

    const response = await fetch("/api/convex/token", {
      method: "POST",
      cache: "no-store",
    });
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("token" in payload) ||
      typeof payload.token !== "string"
    ) {
      return null;
    }
    return payload.token;
  }, [isAuthenticated]);

  return {
    isLoading: status === "loading",
    isAuthenticated,
    fetchAccessToken,
  };
}

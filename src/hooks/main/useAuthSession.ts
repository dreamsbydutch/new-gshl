"use client";

import { useCallback } from "react";
import { signOut, useSession } from "next-auth/react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function useAuthSession() {
  const { data: session, status, update } = useSession();

  return {
    session,
    status,
    update,
  };
}

export function useAuthActions() {
  const disconnectBrowser = useMutation(api.notifications.disconnectBrowser);
  const signOutUser = useCallback(async () => {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          try {
            await Promise.race([
              disconnectBrowser({ endpoint: subscription.endpoint }),
              new Promise<void>((resolve) => setTimeout(resolve, 1500)),
            ]);
          } catch {
            /* Still revoke the browser subscription when offline. */
          }
        }
        await subscription?.unsubscribe();
      } catch {
        // Signing out must remain available if browser push is unavailable.
      }
    }
    return signOut({ redirectTo: "/" });
  }, [disconnectBrowser]);

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

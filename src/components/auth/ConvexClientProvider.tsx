"use client";

import { useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  ConvexProviderWithAuth,
  ConvexReactClient,
} from "convex/react";

function useNextAuthForConvex() {
  const { data: session, status } = useSession();
  const isAuthenticated =
    status === "authenticated" && session.user.status === "active";

  const fetchAccessToken = useCallback(async () => {
    if (!isAuthenticated) return null;

    const response = await fetch("/api/convex/token", {
      method: "POST",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { token?: string };
    return payload.token ?? null;
  }, [isAuthenticated]);

  return {
    isLoading: status === "loading",
    isAuthenticated,
    fetchAccessToken,
  };
}

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is required");
    return new ConvexReactClient(url);
  }, []);

  return (
    <ConvexProviderWithAuth client={client} useAuth={useNextAuthForConvex}>
      {children}
    </ConvexProviderWithAuth>
  );
}

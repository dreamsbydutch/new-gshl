"use client";

import { useMemo } from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useConvexAuth } from "@gshl-hooks";

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
    <ConvexProviderWithAuth client={client} useAuth={useConvexAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}

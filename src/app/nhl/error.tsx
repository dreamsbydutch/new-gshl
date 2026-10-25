"use client";
import { NhlExplorerError } from "@gshl-components/nhl/NhlExplorerError";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <NhlExplorerError error={error} reset={reset} />;
}

"use client";
import { Button } from "@gshl-ui";
import { useNhlExplorerRecovery } from "../../hooks/main/useNhlExplorerRecovery";

export function NhlExplorerError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const { reload } = useNhlExplorerRecovery(error);
  return (
    <div role="alert" className="space-y-3 rounded-xl border p-6">
      <h2 className="text-lg font-semibold">This NHL view couldn’t load</h2>
      <p>
        You can retry this view or reload the app to get the latest version.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
        <Button onClick={reload}>Reload app</Button>
      </div>
    </div>
  );
}

"use client";

import { useNotificationCenter } from "@gshl-hooks/features/useNotificationCenter";
import { Button } from "@gshl-ui";

export function PushNotificationSetup() {
  const setup = useNotificationCenter(false);
  if (!setup.settings || !setup.deviceChecked) return null;

  return (
    <section
      aria-label="Push notification setup"
      className="space-y-3 border-y py-4"
    >
      <div>
        <h2 className="text-sm font-semibold">
          {setup.pushReady
            ? "Push notifications enabled on this device"
            : "Set up push notifications"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Receive league updates on this device. Choose which updates you want
          in Preferences below.
        </p>
      </div>
      {setup.needsHomeScreen ? (
        <ol className="list-inside list-decimal space-y-1 text-sm">
          <li>Open GSHL in Safari and tap Share.</li>
          <li>Choose Add to Home Screen, then Add.</li>
          <li>
            Open GSHL from your Home Screen, sign in, and enable push
            notifications here.
          </li>
        </ol>
      ) : !setup.supported ? (
        <p className="text-sm">
          This browser cannot receive push notifications. Try a supported
          browser or another device. Your notification inbox still works.
        </p>
      ) : setup.permission === "denied" ? (
        <p className="text-sm">
          Notifications are blocked. Open this site&apos;s permissions in your
          browser settings, allow notifications, then return here. On an
          installed iPhone or iPad app, check Settings → Notifications → GSHL.
        </p>
      ) : !setup.settings.publicKey ? (
        <p role="status" className="text-sm">
          Push delivery is awaiting league setup. You can manage your
          preferences below and connect this device once push is available.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {!setup.pushReady ? (
            <Button
              disabled={setup.busy}
              onClick={() => void setup.enablePush()}
            >
              {setup.busy ? "Setting up…" : "Enable push notifications"}
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={setup.busy}
              onClick={() =>
                void setup.run(async () => {
                  if (setup.deviceId)
                    await setup.testPush({ deviceId: setup.deviceId });
                }, "Test queued. Check for a GSHL notification on this device.")
              }
            >
              Send test notification
            </Button>
          )}
        </div>
      )}
      {setup.deviceId && (
        <Button
          variant="ghost"
          disabled={setup.busy}
          onClick={() => void setup.disablePush()}
        >
          Disable on this device
        </Button>
      )}
      {setup.error && (
        <p role="alert" className="text-sm text-red-700">
          {setup.error}
        </p>
      )}
      {setup.notice && (
        <p role="status" className="text-sm">
          {setup.notice}
        </p>
      )}
    </section>
  );
}

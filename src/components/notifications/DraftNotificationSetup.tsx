"use client";

import Link from "next/link";
import { useNotificationCenter } from "@gshl-hooks/features/useNotificationCenter";
import { useAuthSession } from "@gshl-hooks/main/useAuthSession";
import { Button } from "@gshl-ui";

export function DraftNotificationSetup({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { session, status } = useAuthSession();
  const setup = useNotificationCenter(false);
  if (status === "loading") return null;
  if (!session?.user)
    return compact ? (
      <section aria-label="Draft notifications" className="border-y py-3">
        <p className="text-sm font-medium">Get ready for the draft</p>
        <Link
          href="/signin?callbackUrl=%2Fnotifications"
          className="inline-flex min-h-11 items-center text-sm underline"
        >
          Sign in to set up draft alerts
        </Link>
      </section>
    ) : null;
  if (!setup.settings || !setup.browserChecked) return null;
  if (compact && setup.draftReady)
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-y py-2 text-sm">
        <span>Draft alerts enabled on this device</span>
        <Link
          href="/notifications"
          className="inline-flex min-h-9 items-center underline"
        >
          Check notification setup
        </Link>
      </div>
    );
  return (
    <section
      aria-label="Draft notification setup"
      className="space-y-3 border-y py-4"
    >
      <div>
        <h2 className="text-sm font-semibold">
          {setup.draftReady
            ? "Draft alerts enabled on this device"
            : "Get ready for the draft"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Allow notifications for the draft start, your turn, upcoming picks,
          and the final minute on your clock.
        </p>
      </div>
      {setup.needsHomeScreen ? (
        <ol className="list-inside list-decimal space-y-1 text-sm">
          <li>Open GSHL in Safari and tap Share.</li>
          <li>Choose Add to Home Screen, then Add.</li>
          <li>
            Open GSHL from your Home Screen, sign in, and enable draft alerts
            here.
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
          Push delivery is awaiting league setup. You can save draft reminders
          now; return here to allow this device once push is available.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {!setup.draftReady && (
            <Button
              disabled={setup.busy}
              onClick={() => void setup.enablePush(true)}
            >
              {setup.busy ? "Setting up…" : "Enable draft alerts"}
            </Button>
          )}
          {setup.draftReady && (
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
          {!compact && setup.deviceId && (
            <Button
              variant="ghost"
              disabled={setup.busy}
              onClick={() => void setup.disablePush()}
            >
              Disable on this device
            </Button>
          )}
        </div>
      )}
      {!setup.draftReady &&
        (!setup.supported ||
          setup.needsHomeScreen ||
          setup.permission === "denied" ||
          !setup.settings.publicKey) && (
          <Button
            variant="outline"
            disabled={setup.busy}
            onClick={() =>
              void setup.run(
                () => setup.enableDraftReminders({}),
                "Draft preferences saved. Device permission is still needed for push.",
              )
            }
          >
            Save draft reminders
          </Button>
        )}
      {!setup.draftReady &&
        setup.supported &&
        !setup.needsHomeScreen &&
        setup.permission !== "denied" &&
        setup.settings.publicKey && (
          <p className="text-xs text-muted-foreground">
            Choose Allow when your browser asks. You can change each reminder
            later.
          </p>
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
      {compact && (
        <Link
          href="/notifications"
          className="inline-flex min-h-9 items-center text-sm underline"
        >
          Notification settings and device help
        </Link>
      )}
    </section>
  );
}

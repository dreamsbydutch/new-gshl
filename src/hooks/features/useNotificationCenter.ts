"use client";
import { useEffect, useState } from "react";
import { useNotifications } from "@gshl-hooks/main/useNotifications";
import { DRAFT_REMINDER_CATEGORIES } from "@gshl-utils/features/notifications";

export function useNotificationCenter(includeInbox = true) {
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const [browserChecked, setBrowserChecked] = useState(false);
  const [needsHomeScreen, setNeedsHomeScreen] = useState(false);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const data = useNotifications(endpoint, includeInbox);
  useEffect(() => {
    const ios =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && navigator.standalone === true);
    setNeedsHomeScreen(ios && !standalone);
    const available =
      window.isSecureContext &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(available);
    if (!available) {
      setBrowserChecked(true);
      return;
    }
    let active = true;
    const refresh = () => {
      setPermission(Notification.permission);
      void navigator.serviceWorker
        .getRegistration()
        .then(async (registration) => {
          const subscription =
            await registration?.pushManager.getSubscription();
          if (active) {
            setEndpoint(subscription?.endpoint ?? null);
            setBrowserChecked(true);
          }
        })
        .catch(() => {
          if (active) {
            setBrowserChecked(true);
            setError("Could not check browser notifications. Try reloading.");
          }
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);

  async function run(work: () => Promise<unknown>, message?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
      if (message) setNotice(message);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save changes. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function enablePush(draftReminders = false) {
    await run(
      async () => {
        if (!data.settings?.publicKey)
          throw new Error("Push notifications are not configured yet.");
        const granted = await Notification.requestPermission();
        setPermission(granted);
        if (granted !== "granted")
          throw new Error(
            "Allow notifications in your browser settings to enable push.",
          );
        await navigator.serviceWorker.register("/sw.js");
        const registration = await navigator.serviceWorker.ready;
        const key = Uint8Array.from(
          atob(data.settings.publicKey.replace(/-/g, "+").replace(/_/g, "/")),
          (char) => char.charCodeAt(0),
        );
        let existing = await registration.pushManager.getSubscription();
        if (existing) {
          const oldKey = new Uint8Array(
            existing.options.applicationServerKey ?? new ArrayBuffer(0),
          );
          if (
            oldKey.length !== key.length ||
            oldKey.some((value, index) => value !== key[index])
          ) {
            await existing.unsubscribe();
            existing = null;
          }
        }
        const subscription =
          existing ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          }));
        const json = subscription.toJSON();
        if (!json.keys?.p256dh || !json.keys.auth)
          throw new Error("Your browser did not return a valid subscription.");
        try {
          await data.subscribe({
            endpoint: subscription.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
            label: /iPhone|iPad/.test(navigator.userAgent)
              ? "iPhone / iPad"
              : navigator.userAgent.includes("Android")
                ? "Android browser"
                : "Desktop browser",
          });
        } catch (cause) {
          await subscription.unsubscribe();
          setEndpoint(null);
          throw cause;
        }
        setEndpoint(subscription.endpoint);
        if (draftReminders) await data.enableDraftReminders({});
      },
      draftReminders
        ? "Draft reminders enabled. Send a test to check this device."
        : "Push enabled on this device.",
    );
  }
  async function disablePush() {
    await run(async () => {
      if (data.deviceId) await data.removeDevice({ id: data.deviceId });
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
      setEndpoint(null);
    }, "Push disabled on this device.");
  }
  return {
    ...data,
    supported,
    browserChecked,
    needsHomeScreen,
    draftReady:
      permission === "granted" &&
      Boolean(data.deviceId) &&
      DRAFT_REMINDER_CATEGORIES.every(
        (category) =>
          data.settings?.options.find((option) => option.key === category)
            ?.push,
      ),
    permission,
    busy,
    error,
    notice,
    run,
    enablePush,
    disablePush,
  };
}

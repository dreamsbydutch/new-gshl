/// <reference lib="webworker" />
const pushWorker = /** @type {ServiceWorkerGlobalScope} */ (
  /** @type {unknown} */ (self)
);

pushWorker.addEventListener("install", (event) => {
  event.waitUntil(pushWorker.skipWaiting());
});
pushWorker.addEventListener("activate", (event) => {
  event.waitUntil(pushWorker.clients.claim());
});

pushWorker.addEventListener("push", (event) => {
  let message;
  try {
    message = event.data?.json();
  } catch {
    return;
  }
  if (!message || typeof message.title !== "string") return;
  event.waitUntil(
    pushWorker.registration.showNotification(message.title, {
      body: typeof message.body === "string" ? message.body : "",
      icon: "/gshl-notification-icon.png",
      tag: message.tag,
      data: { href: message.href },
    }),
  );
});
pushWorker.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.href || "/notifications",
    self.location.origin,
  );
  const href =
    target.origin === self.location.origin
      ? target.href
      : new URL("/notifications", self.location.origin).href;
  event.waitUntil(
    pushWorker.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        const client = clients.find(
          (window) => new URL(window.url).origin === self.location.origin,
        );
        if (client) {
          await client.navigate(href);
          return client.focus();
        }
        return pushWorker.clients.openWindow(href);
      }),
  );
});

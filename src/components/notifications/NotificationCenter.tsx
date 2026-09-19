"use client";

import Link from "next/link";
import { useState } from "react";
import { useNotificationCenter } from "@gshl-hooks/features/useNotificationCenter";
import { Button, Skeleton } from "@gshl-ui";
import { DraftNotificationSetup } from "./DraftNotificationSetup";

export function NotificationCenter() {
  const center = useNotificationCenter();
  const [tab, setTab] = useState<"inbox" | "preferences">("inbox");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [subjectKey, setSubjectKey] = useState("");
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="text-xl font-semibold">Notifications</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your league updates and notification preferences.
      </p>
      <div className="mt-4">
        <DraftNotificationSetup />
      </div>
      <div className="mt-4 flex gap-4 border-b" aria-label="Notification views">
        {(["inbox", "preferences"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={`min-h-11 border-b-2 px-1 text-sm capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 ${tab === value ? "border-slate-800 font-semibold" : "border-transparent text-muted-foreground"}`}
          >
            {value}
          </button>
        ))}
      </div>
      {center.error && (
        <p role="alert" className="my-3 text-sm text-red-700">
          {center.error}
        </p>
      )}
      {center.notice && (
        <p role="status" className="my-3 text-sm">
          {center.notice}
        </p>
      )}
      {!center.settings ? (
        <div className="space-y-3 py-6" aria-label="Loading notifications">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : tab === "inbox" ? (
        <section aria-label="Inbox" className="py-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Recent updates</h2>
            <Button
              variant="ghost"
              size="sm"
              disabled={center.busy}
              onClick={() =>
                void center.run(async () => {
                  let more = true;
                  while (more) more = (await center.markAllRead({})).more;
                }, "All notifications marked as read.")
              }
            >
              Mark all read
            </Button>
          </div>
          {center.inbox.status === "LoadingFirstPage" ? (
            <Skeleton className="mt-4 h-24 w-full" />
          ) : center.inbox.results.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">
              You are all caught up. New updates will appear here.
            </p>
          ) : (
            <ul className="divide-y">
              {center.inbox.results.map((item) => (
                <li key={item._id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={item.href}
                      onClick={() =>
                        void center.run(() => center.markRead({ id: item._id }))
                      }
                      className="min-w-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                    >
                      <span
                        className={`text-sm ${item.read ? "font-medium" : "font-bold"}`}
                      >
                        {!item.read && (
                          <span
                            className="mr-2 inline-block h-2 w-2 rounded-full bg-slate-800"
                            aria-label="Unread"
                          />
                        )}
                        {item.title}
                      </span>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {item.body}
                      </p>
                    </Link>
                    {!item.read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={center.busy}
                        onClick={() =>
                          void center.run(() =>
                            center.markRead({ id: item._id }),
                          )
                        }
                      >
                        Mark read
                      </Button>
                    )}
                  </div>
                  <time
                    dateTime={new Date(item.createdAt).toISOString()}
                    className="mt-2 block text-xs text-muted-foreground"
                  >
                    {new Date(item.createdAt).toLocaleString()}
                  </time>
                </li>
              ))}
            </ul>
          )}
          {center.inbox.status === "CanLoadMore" && (
            <Button variant="outline" onClick={() => center.inbox.loadMore(20)}>
              Load more
            </Button>
          )}
          {center.inbox.status === "LoadingMore" && (
            <p role="status" className="text-sm">
              Loading…
            </p>
          )}
        </section>
      ) : (
        <section aria-label="Preferences" className="divide-y">
          <div className="py-4">
            <h2 className="text-sm font-semibold">Choose your updates</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Preferences apply across your devices. Push requires an enabled
              device.
            </p>
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] gap-2 text-center text-xs text-muted-foreground">
              <span />
              <span>Inbox</span>
              <span>Push</span>
            </div>
            {center.settings.options.map((option) => (
              <div
                key={option.key}
                className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] items-center gap-2 border-b py-3 last:border-0"
              >
                <div>
                  <h3 className="text-sm font-medium">{option.label}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {option.description}
                  </p>
                </div>
                {(["inbox", "push"] as const).map((channel) => (
                  <label
                    key={channel}
                    className="grid min-h-11 place-items-center"
                  >
                    <span className="sr-only">
                      {option.label}: {channel}
                    </span>
                    <input
                      type="checkbox"
                      checked={option[channel]}
                      disabled={center.busy}
                      className="h-4 w-4 accent-slate-800 focus-visible:ring-2 focus-visible:ring-slate-500"
                      onChange={(event) => {
                        const checked = event.target.checked;
                        void center.run(
                          () =>
                            center.savePreference({
                              category: option.key,
                              inbox: option.inbox,
                              push: option.push,
                              [channel]: checked,
                            }),
                          "Preference saved.",
                        );
                      }}
                    />
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="py-4">
            <h2 className="text-sm font-semibold">Connected devices</h2>
            {center.settings.devices.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No devices connected.
              </p>
            ) : (
              <ul className="divide-y">
                {center.settings.devices.map((device) => (
                  <li
                    key={device.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <span className="text-sm">
                      {device.label}
                      {device.id === center.deviceId ? " (this device)" : ""}
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Connected{" "}
                        {new Date(device.updatedAt).toLocaleDateString()}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={center.busy}
                      onClick={() =>
                        void (device.id === center.deviceId
                          ? center.disablePush()
                          : center.run(
                              () => center.removeDevice({ id: device.id }),
                              "Device removed.",
                            ))
                      }
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {center.settings.isCommissioner && (
            <form
              className="space-y-3 py-4"
              onSubmit={(event) => {
                event.preventDefault();
                void center.run(async () => {
                  await center.announce({
                    title,
                    body,
                    subject: center.settings?.subjects.find(
                      (option) => option.key === subjectKey,
                    )?.subject,
                  });
                  setTitle("");
                  setBody("");
                  setSubjectKey("");
                }, "Announcement sent.");
              }}
            >
              <h2 className="text-sm font-semibold">
                Commissioner announcement
              </h2>
              <p className="text-xs text-muted-foreground">
                Send an update to users who have league announcements enabled.
              </p>
              <label className="block text-sm">
                About
                <select
                  value={subjectKey}
                  onChange={(event) => setSubjectKey(event.target.value)}
                  className="mt-1 block min-h-11 w-full rounded border bg-white px-3"
                >
                  <option value="">League</option>
                  {center.settings.subjects.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Chooses the notification logo. Recipients stay the same.
                </span>
              </label>
              <label className="block text-sm">
                Title
                <input
                  required
                  maxLength={100}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1 block min-h-11 w-full rounded border bg-transparent px-3"
                />
              </label>
              <label className="block text-sm">
                Message
                <textarea
                  required
                  maxLength={500}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded border bg-transparent p-3"
                />
              </label>
              <Button
                type="submit"
                disabled={center.busy || !title.trim() || !body.trim()}
              >
                Send announcement
              </Button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}

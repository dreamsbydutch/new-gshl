"use client";
import {
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { api } from "../../../convex/_generated/api";

export function useNotificationCount() {
  const { isAuthenticated } = useConvexAuth();
  const count = useQuery(
    api.notifications.unread,
    isAuthenticated ? {} : "skip",
  );
  return { count: count ?? 0 };
}

export function useNotifications(endpoint: string | null, includeInbox = true) {
  const { isAuthenticated } = useConvexAuth();
  const settings = useQuery(
    api.notifications.settings,
    isAuthenticated ? {} : "skip",
  );
  const inbox = usePaginatedQuery(
    api.notifications.inbox,
    isAuthenticated && includeInbox ? {} : "skip",
    { initialNumItems: 20 },
  );
  const deviceId = useQuery(
    api.notifications.deviceForEndpoint,
    isAuthenticated && endpoint ? { endpoint } : "skip",
  );
  const savePreference = useMutation(api.notifications.savePreference);
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const subscribe = useMutation(api.notifications.subscribe);
  const removeDevice = useMutation(api.notifications.removeDevice);
  const announce = useMutation(api.notifications.announce);
  const enableDraftReminders = useMutation(
    api.notifications.enableDraftReminders,
  );
  const testPush = useMutation(api.notifications.testPush);
  return {
    settings,
    inbox,
    deviceId,
    savePreference,
    markRead,
    markAllRead,
    subscribe,
    removeDevice,
    announce,
    enableDraftReminders,
    testPush,
  };
}

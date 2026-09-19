# User notifications

[Wiki home](../README.md)

## User experience

Home shows a draft notification setup panel. It also appears above the inbox
in Notifications, so users do not need to find Preferences first. The Draft Hub
uses its top-right space for the Live/Auto draft mode control.
**Enable draft alerts** requests browser permission, registers this device, and
enables the four time-sensitive draft reminders in one action. Other preferences
stay unchanged. Permission is requested only after a button press.

The panel distinguishes blocked permission, unsupported browsers, iPhone/iPad
Home Screen installation, and missing league configuration. Returning from
browser settings refreshes the permission status. A test button sends only to
the signed-in user's selected device, at most once per minute; its success message
confirms that delivery was queued, not that the operating system displayed it.
When push is unavailable, users can save reminder preferences without the app
claiming their device is connected.

Signed-in users open `/notifications` from the bell beside their account.
The inbox supports unread counts, individual and bulk read actions, and paginated
history. Preferences offer eight categories with independent inbox and push
controls: draft starting, on the clock, up next, clock running low, pick
confirmation, draft complete, league announcements, and Press Box editions.
The authoritative labels and defaults are in
[`notifications.ts`](../../src/lib/utils/features/notifications.ts).

Inbox notifications default to enabled. Push defaults favor time-sensitive draft
alerts and announcements, but no device receives push until the user explicitly
enables it and grants browser permission. Preferences apply to all devices;
users can remove any of their connected devices. Signing out revokes the current
browser subscription. On iOS/iPadOS, open the installed Home Screen app before
enabling push. Unsupported browsers retain the inbox.

Only commissioner accounts see the announcement form in Preferences or can send
league announcements. The server rejects other roles, including direct API calls.
Announcements publish immediately to eligible users.

Push popups use the subject's logo: draft pick/turn/upcoming/clock alerts resolve
the pick's current team and franchise, and Press Box alerts use the existing
Press Box brand. Commissioners can choose a team, conference, or Press Box as an
announcement's subject; this changes its logo, not its recipients. Logos are
resolved at delivery time so updated team branding and traded picks stay current.
Missing or invalid logos and general league alerts use the white-background GSHL logo in
`public/gshl-notification-icon.png`. The web app manifest and Apple touch icon use
the same asset for installed apps.
Android's status bar uses a separate transparent, monochrome 96px badge at
`public/gshl-notification-badge.png`, supplied through the worker's `badge`
option. The operating system controls its tint; the white-background popup icon
is unchanged. Badge support varies by browser. Existing displayed notifications
keep their old icon; test a new notification after the service worker updates.

## Delivery

- A one-minute Convex scan checks indexed draft start times from the previous
  seven days through the next 15 minutes, with at most 20 seasons per scan.
- The starting reminder runs within 15 minutes of the scheduled draft. It also
  schedules the first on-clock check for the exact start time.
- Pick submission and undo schedule immediate checks. Owner notifications use
  the pick's current team and franchise owner, including traded picks.
- Up-next alerts cover the next two selections, once per upcoming pick version.
  A user's next pick is suppressed while that user is already on the clock.
- The existing four-minute draft clock schedules its final-minute reminder.
  Expired clocks do not produce actionable turn reminders.
- Pick confirmations are emitted within the pick transaction. Draft completion
  is announced after the final selection, including after undo and re-completion.
- The scan finds up to 50 newly published Press Box editions from the previous
  hour. Hidden editions are excluded from push delivery.

`notificationEvents` deduplicates domain events; `notifications` deduplicates each
recipient/event pair. Fan-out paginates active accounts in batches of 50. Personal
draft alerts require a linked owner or commissioner account. Accounts created
after the event are excluded. Push-only and fully disabled events have hidden
recipient records for deduplication, but do not appear in the inbox.

Push uses internal scheduled Node actions and `web-push`. Each attempt rechecks
account status, preferences, subscription ownership, event expiry, and live draft
state. Device removal prevents subsequent attempts. Transient network, 429, and
5xx failures retry up to three times; 404/410 responses remove stale subscriptions.
Endpoint and encryption-key material is never returned in device lists or logged.
Supported provider hosts are allowlisted before registration and delivery.

The service worker shows notifications and opens same-origin destinations. It
does not cache authenticated pages. Push is best effort: OS/browser settings and
network availability can delay delivery. Already displayed notifications cannot
be recalled after an undo or preference change. Inbox history remains available.

## Deployment configuration

Deploy the Convex schema/functions and the Next.js application together. Configure
these variables on the intended **Convex deployment**, not in browser code:

| Variable               | Purpose                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `WEB_PUSH_PUBLIC_KEY`  | VAPID public key, exposed to authenticated subscription clients. |
| `WEB_PUSH_PRIVATE_KEY` | Matching VAPID private key; server only.                         |
| `WEB_PUSH_SUBJECT`     | Operator contact as a `mailto:` or public HTTPS URI.             |

Generate one VAPID key pair using `web-push.generateVAPIDKeys()` in a trusted
operator environment and place it directly in the deployment's secret store.
Never commit keys or print the private key into shared logs. Keep the pair stable;
rotating it requires users to re-enable subscriptions. Without all three values,
the UI reports that push setup is pending and inbox/preferences remain usable.
The app must use HTTPS except during localhost development.

No production deployment or live notification send is part of local verification.
After deployment, enable push on a test account and verify a commissioner
announcement with the app closed. Then use a test draft to verify turn, upcoming,
final-minute, pick, undo, and completion behavior; confirm opt-outs, sign-out,
and device removal stop future delivery.

## Verification

`convex/notifications.test.ts` exercises real handler logic with an in-memory
database fixture: authorization, preferences, endpoint validation, fan-out
deduplication, delivery-time checks, and draft clock changes. It does not replace
real Convex scheduling or browser/OS push verification.

See [verification](verification.md) for root checks and
[environment](../reference/environment.md) for configuration ownership.

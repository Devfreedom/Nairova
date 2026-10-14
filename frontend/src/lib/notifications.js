// Pure notification-inbox helpers shared by the Notifications page.
// No DOM, no network, no secrets: destination allowlisting, page merging,
// and read-state transitions only. Tested with `npm run test:parser`.

// Only these internal destinations may be linked from a notification.
// Anything else resolves to null and renders as plain text, never a link.
export const NOTIFICATION_DESTINATIONS = {
  "/": { to: "/", label: "View dashboard" },
  "/transfer": { to: "/transfer", label: "Go to transfer" },
  "/history": { to: "/history", label: "View in history" },
};

export function resolveNotificationDestination(destination) {
  if (!destination) return null;
  return NOTIFICATION_DESTINATIONS[destination] || null;
}

// Appends a fetched page to the loaded items, skipping ids already present
// so a retried page can never duplicate a row.
export function mergeNotificationPages(prev, incoming) {
  const seen = new Set(prev.map((n) => n.id));
  return [...prev, ...incoming.filter((n) => !seen.has(n.id))];
}

export function applyMarkRead(items, id) {
  return items.map((n) => (n.id === id ? { ...n, read: true } : n));
}

export function applyMarkAllRead(items) {
  return items.map((n) => ({ ...n, read: true }));
}

// Mirrors the badge decrement: never below zero, never guessed upward.
export function decrementUnread(unread) {
  return Math.max(0, unread - 1);
}

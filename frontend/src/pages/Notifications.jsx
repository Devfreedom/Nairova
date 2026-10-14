import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import {
  applyMarkAllRead,
  applyMarkRead,
  decrementUnread,
  mergeNotificationPages,
  resolveNotificationDestination,
} from "../lib/notifications";
import { useUnread } from "../notifications/UnreadContext";
import { Alert, Empty, Skeleton } from "../components/ui";

function NotificationRow({ item, onMarkRead, marking }) {
  const dest = resolveNotificationDestination(item.destination);
  return (
    <li
      className={`t-border -mx-2 flex items-start gap-3 rounded-xl px-2 py-3 ${
        item.read ? "" : "bg-[var(--surface-2)]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
          item.read ? "bg-[var(--border)]" : "bg-[var(--brand-strong)]"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="t-text text-sm font-bold">{item.title}</p>
        <p className="t-muted mt-0.5 text-[13px]">{item.message}</p>
        <p className="t-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span>{formatDate(item.createdAt)}</span>
          {item.reference && <span className="font-mono">Ref {item.reference}</span>}
          {dest && (
            <Link to={dest.to} className="link-brand font-semibold">
              {dest.label}
            </Link>
          )}
        </p>
      </div>
      {!item.read && (
        <button
          type="button"
          onClick={() => onMarkRead(item.id)}
          disabled={marking}
          className="link-brand shrink-0 rounded px-1 py-1 text-xs font-bold"
          aria-label={`Mark "${item.title}" as read`}
        >
          Mark read
        </button>
      )}
    </li>
  );
}

export default function Notifications() {
  const { refresh } = useUnread();
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async ({ cursor = null, append = false } = {}) => {
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError("");
    }
    try {
      const [list, count] = await Promise.all([
        api.notifications({ cursor, limit: PAGE_SIZE }),
        api.unreadCount(),
      ]);
      setItems((prev) => (append ? [...prev, ...(list.data || [])] : list.data || []));
      setNextCursor(list.page?.nextCursor ?? null);
      setUnread(count.data?.unreadCount ?? 0);
      await refresh();
    } catch (err) {
      if (!append) setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [refresh]);

  useEffect(() => {
    async function boot() {
      await load();
    }
    boot();
  }, [load]);

  async function handleMarkRead(id) {
    if (marking) return;
    setMarking(true);
    try {
      await api.markNotificationRead(id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnread((u) => Math.max(0, u - 1));
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setMarking(false);
    }
  }

  async function handleMarkAll() {
    if (marking) return;
    setMarking(true);
    setError("");
    try {
      await api.markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="eyebrow">Updates</p>
          <h1 className="t-text mt-1 text-[26px] font-extrabold tracking-tight sm:text-3xl">Notifications</h1>
        </div>
        {!loading && items.length > 0 && (
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <p className="t-muted rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-bold">
                {unread} unread
              </p>
            )}
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={marking || unread === 0}
              className="btn-secondary !px-3 !py-1.5 text-xs"
            >
              {marking ? "…" : "Mark all as read"}
            </button>
          </div>
        )}
      </header>
      {!loading && (
        <p className="t-muted mt-1 text-[13px]">
          {items.length === 0
            ? "Genuine account events will appear here."
            : "Newest first · from your completed transactions"}
        </p>
      )}

      <div className="mt-4"><Alert>{error}</Alert></div>

      {loading ? (
        <div className="card mt-4" aria-label="Loading notifications">
          <div className="space-y-3 py-1">
            <Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" />
          </div>
        </div>
      ) : error && items.length === 0 ? (
        <div className="card mt-4">
          <Empty title="Could not load notifications" hint={error} />
          <button type="button" onClick={() => load()} className="btn-secondary mt-4 w-full">
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="card mt-4">
          <Empty title="No notifications yet" hint="Completed transfers, deposits and simulated credits will appear here." />
          <Link to="/" className="btn-secondary mt-4 w-full">Back to dashboard</Link>
        </div>
      ) : (
        <section aria-label="Notifications" className="card mt-4">
          <ul className="t-border divide-y">
            {items.map((n) => (
              <NotificationRow key={n.id} item={n} onMarkRead={handleMarkRead} marking={marking} />
            ))}
          </ul>
          {nextCursor && (
            <button
              type="button"
              onClick={() => load({ cursor: nextCursor, append: true })}
              disabled={loadingMore}
              className="btn-secondary mt-3 w-full"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken } from "../lib/api";

// Unread badge count for the notification bell. Fetched from the API (never
// guessed locally) whenever the route changes and after read actions.
// No polling: the count is a point-in-time value, not realtime delivery.
const UnreadContext = createContext({ unread: 0, refresh: async () => {} });

export function UnreadProvider({ children }) {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUnread(0);
      return;
    }
    try {
      const res = await api.unreadCount();
      setUnread(res.data?.unreadCount ?? 0);
    } catch {
      // Badge stays at its last known value; the page surfaces real errors.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <UnreadContext.Provider value={{ unread, refresh, setUnread }}>
      {children}
    </UnreadContext.Provider>
  );
}

export function useUnread() {
  return useContext(UnreadContext);
}

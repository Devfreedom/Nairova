// Single reusable API client: base URL, JSON headers, bearer token, error handling.
// Token lives in sessionStorage (cleared on logout) — classroom trade-off, not
// equivalent to secure HttpOnly cookies. Tokens are never logged.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const TOKEN_KEY = "bankapp.token";

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export let onUnauthorized = null;
export function setOnUnauthorized(fn) {
  onUnauthorized = fn;
}

async function request(path, { method = "GET", body, auth = true, signal } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    // Network failure or abort (e.g. timeout): the server may still have
    // committed, so callers must treat this as an uncertain outcome.
    const networkError =
      err?.name === "AbortError"
        ? new Error("The request timed out. The transfer may still have completed.")
        : new Error("Cannot reach the API. Is the backend running?");
    networkError.isNetworkError = true;
    networkError.status = null;
    throw networkError;
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (res.status === 401 && auth && onUnauthorized) {
    onUnauthorized();
  }

  if (!res.ok) {
    const details = data?.errors ? `: ${(data.errors || []).join(", ")}` : "";
    let message = data?.message || `Request failed (${res.status})`;
    // Surface the backend's rate-limit signal with a user-friendly wait hint.
    // Nothing here bypasses the limit — it only reads the response headers.
    if (res.status === 429) {
      const wait = retryWaitMessage(res.headers);
      if (wait) message += ` ${wait}`;
    }
    // Carry the status so callers can separate definitive backend rejections
    // (4xx: nothing was executed) from uncertain outcomes (network/5xx).
    const failure = new Error(`${message}${details}`);
    failure.status = res.status;
    failure.isNetworkError = false;
    throw failure;
  }
  return data;
}

function retryWaitMessage(headers) {
  if (!headers || typeof headers.get !== "function") return "";
  const raw = headers.get("Retry-After") || headers.get("RateLimit-Reset");
  if (!raw) return "";
  let seconds = null;
  if (/^\d+$/.test(raw.trim())) {
    seconds = parseInt(raw.trim(), 10);
  } else {
    const at = Date.parse(raw);
    if (!Number.isNaN(at)) seconds = Math.max(0, Math.round((at - Date.now()) / 1000));
  }
  if (seconds === null) return "";
  if (seconds >= 90) {
    const minutes = Math.round(seconds / 60);
    return `Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} before trying again.`;
  }
  if (seconds > 0) {
    return `Please wait ${seconds} second${seconds === 1 ? "" : "s"} before trying again.`;
  }
  return "Please try again shortly.";
}

export const api = {
  register: (payload) => request("/api/auth/register", { method: "POST", body: payload, auth: false }),
  login: (payload) => request("/api/auth/login", { method: "POST", body: payload, auth: false }),
  me: () => request("/api/auth/me"),
  balance: () => request("/api/account/balance"),
  createPin: (pin) => request("/api/account/pin/create", { method: "POST", body: { pin } }),
  updatePin: (oldPin, newPin) =>
    request("/api/account/pin/update", { method: "PUT", body: { oldPin, newPin } }),
  deposit: (amount) => request("/api/account/deposit", { method: "POST", body: { amount } }),
  verifyAccount: (accountNumber) =>
    request(`/api/account/verify/${encodeURIComponent(accountNumber)}`, { method: "POST" }),
  transfer: (payload, signal) => request("/api/transfer", { method: "POST", body: payload, signal }),
  topupCatalogue: () => request("/api/topup/catalogue"),
  topupAirtime: (payload, signal) => request("/api/topup/airtime", { method: "POST", body: payload, signal }),
  topupData: (payload, signal) => request("/api/topup/data", { method: "POST", body: payload, signal }),
  transactions: () => request("/api/account/transactions"),
  adminUsers: () => request("/api/admin/users"),
  adminCredit: (accountNumber, amount, extra = {}) =>
    request("/api/admin/credit", { method: "POST", body: { accountNumber, amount, ...extra } }),
  adminResetPassword: (userId, newPassword, confirmPassword) =>
    request("/api/admin/reset-password", { method: "POST", body: { userId, newPassword, confirmPassword } }),
  adminTransactions: () => request("/api/admin/transactions"),
  profile: (payload) => request("/api/account/profile", { method: "PATCH", body: payload }),
  requestEmailVerification: () =>
    request("/api/account/email/request", { method: "POST" }),
  verifyEmail: (token) =>
    request("/api/account/email/verify", { method: "POST", body: { token } }),
  getPreferences: () => request("/api/account/preferences"),
  updatePreferences: (payload) =>
    request("/api/account/preferences", { method: "PATCH", body: payload }),
  changePassword: (currentPassword, newPassword) =>
    request("/api/account/password", { method: "PUT", body: { currentPassword, newPassword } }),
  notifications: ({ cursor, limit } = {}) => {
    const params = new URLSearchParams();
    if (cursor !== undefined && cursor !== null) params.set("cursor", String(cursor));
    if (limit !== undefined && limit !== null) params.set("limit", String(limit));
    const qs = params.toString();
    return request(`/api/notifications${qs ? `?${qs}` : ""}`);
  },
  unreadCount: () => request("/api/notifications/unread-count"),
  markNotificationRead: (id) =>
    request(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () =>
    request("/api/notifications/read-all", { method: "PATCH" }),
};

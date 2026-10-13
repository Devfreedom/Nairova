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

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Cannot reach the API. Is the backend running?");
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
    throw new Error(`${data?.message || `Request failed (${res.status})`}${details}`);
  }
  return data;
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
  transfer: (payload) => request("/api/transfer", { method: "POST", body: payload }),
  transactions: () => request("/api/account/transactions"),
  adminUsers: () => request("/api/admin/users"),
  adminCredit: (accountNumber, amount) =>
    request("/api/admin/credit", { method: "POST", body: { accountNumber, amount } }),
  adminTransactions: () => request("/api/admin/transactions"),
};

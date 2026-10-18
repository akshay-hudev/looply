/** Thin fetch wrapper. Auth token + active org live in localStorage so EventSource can reuse them. */

const TOKEN = "lm.token";
const ORG = "lm.org";

export const API_BASE = import.meta.env.VITE_API_URL ?? "";

export const auth = {
  token: () => localStorage.getItem(TOKEN),
  org: () => localStorage.getItem(ORG),
  set: (token: string, orgId: string) => {
    localStorage.setItem(TOKEN, token);
    localStorage.setItem(ORG, orgId);
  },
  setOrg: (orgId: string) => localStorage.setItem(ORG, orgId),
  clear: () => {
    localStorage.removeItem(TOKEN);
    localStorage.removeItem(ORG);
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, isForm = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (auth.token()) headers.Authorization = `Bearer ${auth.token()}`;
  if (auth.org()) headers["X-Org-Id"] = auth.org()!;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  void isForm;
  const res = await fetch(`${API_BASE}/api${path}`, { method, headers, body: payload });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (res.status === 401 && !path.startsWith("/auth/")) {
    auth.clear();
    if (!location.pathname.startsWith("/login")) location.assign("/login");
  }
  if (!res.ok) {
    const detail = data?.detail;
    const msg = typeof detail === "string" ? detail : detail?.message || res.statusText;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

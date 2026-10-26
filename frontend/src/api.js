const API = import.meta.env.VITE_API_URL || "/api-proxy";
let accessToken = null;
let refreshing = null;
export function setToken(value) { accessToken = value; }
export async function restoreSession() {
  if (!refreshing) refreshing = fetch(API + "/api/auth/refresh", {method: "POST", credentials: "include"})
    .then(async res => {
      if (!res.ok) throw new Error("Session expired");
      const data = await res.json(); setToken(data.access_token); return data;
    }).finally(() => { refreshing = null; });
  return refreshing;
}

export function token() {
  return accessToken;
}

export async function request(path, options = {}, retry = true) {
  const headers = {...(options.headers || {})};
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (token()) headers.Authorization = `Bearer ${token()}`;

  const res = await fetch(API + path, {...options, headers, credentials: "include"});
  if (res.status === 401 && retry && !path.startsWith("/api/auth/")) {
    try { await restoreSession(); return request(path, options, false); }
    catch { setToken(null); window.dispatchEvent(new Event("session-expired")); }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const error = new Error(typeof data.detail === "string" ? data.detail : `Request failed (${res.status})`);
    error.status = res.status;
    error.code = data.code;
    throw error;
  }
  return res.json();
}

export async function download(path) {
  const headers = {};
  if (token()) headers.Authorization = `Bearer ${token()}`;
  let res = await fetch(API + path, {headers, credentials: "include"});
  if (res.status === 401) {
    await restoreSession();
    headers.Authorization = `Bearer ${token()}`;
    res = await fetch(API + path, {headers, credentials: "include"});
  }
  if (!res.ok) throw new Error(`Yuklab bo‘lmadi (${res.status})`);
  return res.blob();
}

export { API };

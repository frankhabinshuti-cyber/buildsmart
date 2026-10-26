import axios from 'axios';

const TOKEN_KEY = 'buildsmart_token';

// Reading storage can throw in private windows, so every access is wrapped.
export const tokenStore = {
  get() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } },
  clear() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api/v1', timeout: 20000 });

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

api.interceptors.response.use(
  (r) => r,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    // An expired or invalid token on a protected call logs the user out.
    if (status === 401 && tokenStore.get() && !url.includes('/auth/login')) onUnauthorized?.();
    return Promise.reject(error);
  },
);

/** Turns an API error into { message, fields } that forms can display. */
export function readError(error) {
  const e = error?.response?.data?.error;
  if (e) return { message: e.message, fields: e.details && typeof e.details === 'object' ? e.details : {}, code: e.code };
  if (error?.code === 'ERR_NETWORK' || error?.code === 'ECONNABORTED') {
    return { message: 'Cannot reach the server. Check your connection and try again.', fields: {}, code: 'NETWORK' };
  }
  return { message: 'Something went wrong. Please try again.', fields: {}, code: 'UNKNOWN' };
}

import axios from 'axios';

const API_BASE = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1`;

const TOKEN_KEY = 'sp.accessToken';
const REFRESH_KEY = 'sp.refreshToken';

export const tokenStore = {
  get access() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set({ accessToken, refreshToken }) {
    if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

client.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Access tokens are short-lived, so a 401 triggers one silent refresh and a
 * replay of the original request. Concurrent 401s share a single refresh call
 * rather than each firing their own.
 */
let refreshPromise = null;
const onSessionExpired = new Set();

export const subscribeToSessionExpiry = (handler) => {
  onSessionExpired.add(handler);
  return () => onSessionExpired.delete(handler);
};

const refreshTokens = async () => {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) throw new Error('No refresh token');

  // A bare axios call, so this request never re-enters the interceptor.
  const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
  tokenStore.set(data.data.tokens);
  return data.data.tokens.accessToken;
};

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    if (status === 401 && original && !original._retried && tokenStore.refresh) {
      original._retried = true;
      try {
        if (!refreshPromise) {
          refreshPromise = refreshTokens().finally(() => {
            refreshPromise = null;
          });
        }
        const accessToken = await refreshPromise;
        original.headers.Authorization = `Bearer ${accessToken}`;
        return client(original);
      } catch {
        tokenStore.clear();
        onSessionExpired.forEach((handler) => handler());
      }
    }

    return Promise.reject(error);
  },
);

/** Turn an axios failure into the message the API actually sent. */
export const errorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  const data = error?.response?.data;
  if (!data) {
    if (error?.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
    if (error?.message === 'Network Error') return 'Cannot reach the server. Is the backend running?';
    return error?.message || fallback;
  }
  if (Array.isArray(data.details) && data.details.length) {
    return data.details.map((detail) => `${detail.path}: ${detail.message}`).join('; ');
  }
  return data.message || fallback;
};

/** A 409 from the API: the request lost a race (e.g. the last parking space). */
export const isConflict = (error) => error?.response?.status === 409;

export default client;

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/endpoints';
import { subscribeToSessionExpiry, tokenStore } from '../api/client';

const AuthContext = createContext(null);

/**
 * Where each role lands after signing in. Drivers go to the home page, where
 * they can book straight away; their dashboard is one click away in the avatar
 * menu. Owners and admins go to their panels, which have no marketing page.
 */
export const homeRouteFor = (role) =>
  ({ user: '/', owner: '/owner', admin: '/admin' })[role] || '/login';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [ownerProfile, setOwnerProfile] = useState(null);
  // Starts true so a refresh does not flash the login page before /auth/me answers.
  const [loading, setLoading] = useState(Boolean(tokenStore.access));

  const applySession = useCallback((data) => {
    if (data.tokens) tokenStore.set(data.tokens);
    setUser(data.user);
    setOwnerProfile(data.ownerProfile || null);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setOwnerProfile(null);
  }, []);

  // Restore the session from a stored token on first load.
  useEffect(() => {
    if (!tokenStore.access) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then((data) => {
        setUser(data.user);
        setOwnerProfile(data.ownerProfile || null);
      })
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [logout]);

  // The API client tells us when a refresh failed for good.
  useEffect(() => subscribeToSessionExpiry(logout), [logout]);

  const login = useCallback(
    async (credentials) => applySession(await authApi.login(credentials)),
    [applySession],
  );

  const register = useCallback(
    async (payload) => applySession(await authApi.register(payload)),
    [applySession],
  );

  const value = useMemo(
    () => ({
      user,
      ownerProfile,
      setOwnerProfile,
      loading,
      login,
      register,
      logout,
      isAuthenticated: Boolean(user),
      role: user?.role || null,
      refreshUser: async () => {
        const data = await authApi.me();
        setUser(data.user);
        setOwnerProfile(data.ownerProfile || null);
        return data.user;
      },
    }),
    [user, ownerProfile, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
};

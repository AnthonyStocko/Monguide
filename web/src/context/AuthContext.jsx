import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import * as authApi from '../api/auth.js';
import { getMe } from '../api/me.js';
import { getToken, setToken as persistToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => getToken());
  const [user, setUser] = useState(null);

  // Au chargement, si un jeton est deja stocke (rechargement de page), on
  // recupere le profil du parent. Si le jeton n'est plus valide, apiFetch
  // l'efface deja (401) : on aligne juste l'etat React derriere.
  useEffect(() => {
    if (!token || user) return;
    getMe()
      .then(setUser)
      .catch(() => setTokenState(getToken()));
  }, [token, user]);

  const applySession = useCallback((session) => {
    persistToken(session.token);
    setTokenState(session.token);
    setUser(session.user);
  }, []);

  const login = useCallback(async (email, password) => {
    applySession(await authApi.login(email, password));
  }, [applySession]);

  const register = useCallback(async (name, email, password) => {
    applySession(await authApi.register(name, email, password));
  }, [applySession]);

  const logout = useCallback(() => {
    persistToken(null);
    setTokenState(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ token, user, isAuthenticated: Boolean(token), login, register, logout }),
    [token, user, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit etre utilise dans <AuthProvider>');
  return ctx;
}

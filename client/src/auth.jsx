import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading
  const refresh = useCallback(async () => {
    try { setUser((await api.get('/auth/me')).data.user); } catch { setUser(null); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const login = async (email, password) => { const { data } = await api.post('/auth/login', { email, password }); setUser(data.user); return data.user; };
  const register = async (payload) => { const { data } = await api.post('/auth/register', payload); setUser(data.user); return data.user; };
  const logout = async () => { await api.post('/auth/logout'); setUser(null); };
  return <Ctx.Provider value={{ user, login, register, logout, refresh }}>{children}</Ctx.Provider>;
}

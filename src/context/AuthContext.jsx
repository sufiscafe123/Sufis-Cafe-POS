'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { getSupabaseBrowser } from '@/lib/supabase/browser';

const AuthContext = createContext();

const SESSION_EXPIRED_MESSAGE = 'Session expired. Please log in again.';

// True when the server says the staff login itself is no longer valid:
// any 401 with SESSION_INVALID, or a 403 for a deactivated account / inactive restaurant.
// A plain 403 such as "Admin access required" is a permission error, not a dead session.
const isDeadSession = (err) => {
  const status = err.response?.status;
  return (status === 401 || status === 403) && err.response?.data?.code === 'SESSION_INVALID';
};

// The staff session lives in Supabase Auth cookies (set by /api/auth/login and refreshed by
// the proxy), so every /api request from this browser is authenticated automatically.
// `initialUser` / `initialRestaurant` come from the server-rendered root layout.
export function AuthProvider({ children, initialUser = null, initialRestaurant = null }) {
  const [user, setUser] = useState(initialUser);
  const [restaurant, setRestaurantState] = useState(initialRestaurant);
  const [loading, setLoading] = useState(true);

  const setRestaurant = useCallback((r) => {
    setRestaurantState(r);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setRestaurantState(null);
    // Clear the cookies on the server and the browser client's copy of the session
    axios.post('/api/auth/logout').catch(() => {});
    getSupabaseBrowser().auth.signOut({ scope: 'local' }).catch(() => {});
  }, []);

  // Log out, tell the user why, and send them to the login page.
  const expireSession = useCallback(() => {
    logout();
    toast.error(SESSION_EXPIRED_MESSAGE, { id: 'session-expired' });
    if (!window.location.pathname.startsWith('/login')) window.location.assign('/login');
  }, [logout]);

  // Whenever a staff request is rejected because the login is no longer valid, log out
  // instead of leaving a dashboard on screen whose buttons all fail ("ghost UI").
  useEffect(() => {
    const id = axios.interceptors.response.use(
      res => res,
      err => {
        const isLogin = err.config?.url?.includes('/api/auth/login');
        const isCustomerRequest = Boolean(err.config?.headers?.['X-Customer-Token']);
        if (isDeadSession(err) && !isLogin && !isCustomerRequest && user) {
          expireSession();
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, [expireSession, user]);

  useEffect(() => {
    if (initialUser) {
      // Confirm the login is still valid and refresh restaurant details (GST rate, address…).
      axios.get('/api/auth/me')
        .then(res => {
          if (res.data?.user) setUser(res.data.user);
          if (res.data?.restaurant) setRestaurant(res.data.restaurant);
        })
        .catch(err => {
          // A network error (Wi-Fi blip) is not a reason to log the terminal out.
          if (isDeadSession(err)) expireSession();
        });
    }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email, password) => {
    const res = await axios.post('/api/auth/login', { email, password });
    // Let the browser Supabase client (Realtime) pick up the new session cookies
    await getSupabaseBrowser().auth.getSession().catch(() => {});
    setUser(res.data.user);
    setRestaurantState(res.data.restaurant || null);
    return res.data.user;
  };

  return (
    <AuthContext.Provider value={{ user, restaurant, setRestaurant, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

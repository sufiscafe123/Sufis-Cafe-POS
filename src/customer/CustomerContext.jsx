'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { createRealtimeSocket } from '@/lib/realtime-client';
import toast from 'react-hot-toast';

const CustomerContext = createContext(null);

const STORAGE = {
  profile: 'srms_customer_profile',
  token: 'srms_customer_token',
  table: 'srms_customer_table',
  tableKey: 'srms_customer_table_key',
  cart: 'srms_customer_cart',
  lastDetails: 'srms_customer_last_details'
};

const readJSON = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
};

// Counter QR (?counter=1): loyalty only, the captain takes the order
export const COUNTER = 'counter';

const parseTable = (value) => {
  if (value === COUNTER) return COUNTER;
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Background refresh is only a safety net — live updates arrive over the socket.
const POLL_MS = 20000;

// The customer session used by every request while the customer app is open.
// The interceptors are registered ONCE for the whole page (not per render or per mount),
// so React's double render in development can't leave behind a copy that sends an old token.
// Kept on window so a dev hot-reload of this file reuses the same session instead of adding a copy.
const session = typeof window === 'undefined'
  ? { token: null, onExpired: null, interceptorsInstalled: true }
  : window.__srmsCustomerSession || (window.__srmsCustomerSession = { token: null, onExpired: null });

const sentToken = (config) => {
  const h = config?.headers;
  if (!h) return null;
  return (typeof h.get === 'function' && h.get('X-Customer-Token')) || h['X-Customer-Token'] || null;
};

// Customer requests carry the session token instead of a staff login.
if (!session.interceptorsInstalled) {
  session.interceptorsInstalled = true;
  axios.interceptors.request.use(config => {
    if (session.token) {
      config.headers['X-Customer-Token'] = session.token;
      delete config.headers.Authorization;
    }
    return config;
  });

  axios.interceptors.response.use(
    res => res,
    err => {
      // Only end the session if the rejected request used the CURRENT token — a late answer
      // to a request made with an older token must not log out a guest who just checked in.
      if (
        err.response?.status === 401 &&
        err.response?.data?.code === 'CUSTOMER_SESSION' &&
        session.token &&
        sentToken(err.config) === session.token
      ) {
        session.onExpired?.();
      }
      return Promise.reject(err);
    }
  );
}

export function CustomerProvider({ children }) {
  // The table comes from the QR code (?table=N). A different table than the saved
  // session means the guest scanned a new table, so they check in again.
  const [tableNumber, setTableNumber] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('counter') ? COUNTER : parseTable(params.get('table'));
    const saved = parseTable(localStorage.getItem(STORAGE.table));
    // The QR key goes with the table it was printed for (kept for checking in again later)
    if (fromUrl) {
      const key = params.get('k');
      if (key) localStorage.setItem(STORAGE.tableKey, key);
      else if (fromUrl !== saved) localStorage.removeItem(STORAGE.tableKey);
    }
    if (fromUrl && fromUrl !== saved) {
      localStorage.removeItem(STORAGE.token);
      localStorage.removeItem(STORAGE.profile);
      localStorage.setItem(STORAGE.table, String(fromUrl));
      return fromUrl;
    }
    return fromUrl || saved;
  });

  const [tableKey, setTableKey] = useState(() => localStorage.getItem(STORAGE.tableKey));
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE.token));
  const [customer, setCustomer] = useState(() => (localStorage.getItem(STORAGE.token) ? readJSON(STORAGE.profile, null) : null));
  const [cart, setCart] = useState(() => readJSON(STORAGE.cart, []));
  const [activeOrders, setActiveOrders] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [socket, setSocket] = useState(null);
  const [restaurantInfo, setRestaurantInfo] = useState({ name: '', gstRate: 5 });
  const [loyaltySettings, setLoyaltySettings] = useState({ stampsPerCard: 8, milestones: [] });
  // After the table is billed: menu and rewards only, logged out at logoutAt
  const [visit, setVisit] = useState({ visitEnded: false, logoutAt: null });
  const tokenRef = useRef(token);
  tokenRef.current = token;
  // Set during render so child screens' first requests (their effects run before ours) carry it
  session.token = token;

  const logoutCustomer = useCallback(() => {
    session.token = null;
    tokenRef.current = null;
    setCustomer(null);
    setToken(null);
    setCart([]);
    setActiveOrder(null);
    setActiveOrders([]);
    localStorage.removeItem(STORAGE.profile);
    localStorage.removeItem(STORAGE.token);
    setVisit({ visitEnded: false, logoutAt: null });
  }, []);

  // End of the visit: forget the table's QR key too, so ordering again needs the QR on the table
  const endVisit = useCallback(() => {
    localStorage.removeItem(STORAGE.tableKey);
    setTableKey(null);
    setCart([]);
    logoutCustomer();
    toast('Thank you for visiting Sufi’s Cafe! Scan the QR code on your table to order again.', { id: 'visit-ended', duration: 8000, icon: '☕' });
  }, [logoutCustomer]);

  const refreshVisit = useCallback(async () => {
    if (!tokenRef.current) return;
    try {
      const res = await axios.get('/api/customers/me/visit');
      setVisit({ visitEnded: Boolean(res.data?.visitEnded), logoutAt: res.data?.logoutAt || null });
      if (res.data?.visitEnded) setCart([]);
    } catch {
      // a 401 here (visit over) logs the guest out through the interceptor
    }
  }, []);

  useEffect(() => { refreshVisit(); }, [token, refreshVisit]);

  // Log out at the end of the 2 hours after the bill
  useEffect(() => {
    if (!visit.logoutAt) return;
    const ms = new Date(visit.logoutAt).getTime() - Date.now();
    if (ms <= 0) { endVisit(); return; }
    const t = setTimeout(endVisit, Math.min(ms, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [visit.logoutAt, endVisit]);

  useEffect(() => {
    session.token = tokenRef.current;
    session.onExpired = () => {
      // Expired (or 2 hours after the bill): ordering again needs the QR code on the table
      localStorage.removeItem(STORAGE.tableKey);
      setTableKey(null);
      logoutCustomer();
      toast.error('Your table session expired. Please check in again.', { id: 'customer-session' });
    };
    return () => {
      // Leaving the customer app (e.g. to the staff login): stop sending the customer token
      session.token = null;
      session.onExpired = null;
    };
  }, [logoutCustomer]);

  // Public restaurant info and loyalty program (shown before check-in too)
  useEffect(() => {
    axios.get('/api/restaurant/public').then(r => r.data && setRestaurantInfo(r.data)).catch(() => {});
    axios.get('/api/loyalty-settings').then(r => r.data && setLoyaltySettings(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE.cart, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    if (customer) localStorage.setItem(STORAGE.profile, JSON.stringify(customer));
    else localStorage.removeItem(STORAGE.profile);
  }, [customer]);

  // One realtime connection per session: the server grants this customer's and this table's topics.
  useEffect(() => {
    const s = createRealtimeSocket({ customerToken: token });
    setSocket(s);
    return () => s.disconnect();
  }, [token]);

  const loginCustomer = async (name, phone, tbl, key) => {
    const targetTable = parseTable(tbl || tableNumber);
    const qrKey = key || tableKey;
    try {
      const res = await axios.post('/api/customers/session', targetTable === COUNTER
        ? { name, phone, counter: true, key: qrKey }
        : { name, phone, tableNumber: targetTable, key: qrKey });
      const place = res.data.counter ? COUNTER : res.data.tableNumber;
      localStorage.setItem(STORAGE.token, res.data.token);
      localStorage.setItem(STORAGE.table, String(place));
      localStorage.setItem(STORAGE.tableKey, qrKey);
      setTableKey(qrKey);
      localStorage.setItem(STORAGE.lastDetails, JSON.stringify({ name, phone }));
      tokenRef.current = res.data.token;
      session.token = res.data.token;
      setToken(res.data.token);
      setCustomer(res.data.customer);
      setTableNumber(place);
      if (res.data.restaurant) setRestaurantInfo(res.data.restaurant);
      return res.data.customer;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not check in. Please try again.');
      throw err;
    }
  };

  const refreshCustomer = useCallback(async () => {
    if (!tokenRef.current || !customer?._id) return;
    try {
      const res = await axios.get(`/api/customers/${customer._id}`);
      if (res.data) setCustomer(res.data);
    } catch {
      // network blip — next poll or socket event will catch up
    }
  }, [customer?._id]);

  const refreshActiveOrders = useCallback(async () => {
    if (!tokenRef.current) return;
    try {
      const res = await axios.get('/api/orders?active=true');
      setActiveOrders(res.data || []);
      setActiveOrder(res.data?.[0] || null);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshActiveOrders();
  }, [token, refreshActiveOrders]);

  // Live updates for this customer and table
  useEffect(() => {
    if (!socket || !customer) return;

    const onCustomerUpdate = (updated) => {
      setCustomer(prev => {
        const justClaimed = (updated.rewards || []).filter(r => r.status === 'redeemed'
          && (prev?.rewards || []).some(p => p._id === r._id && p.status !== 'redeemed'));
        justClaimed.forEach(r => toast.success(`🎉 ${r.title} claimed! Enjoy.`, { id: `claimed-${r._id}`, duration: 6000 }));
        if (prev && updated.totalStamps > (prev.totalStamps || 0)) {
          toast.success(`🎉 Stamp added! You now have ${updated.totalStamps} stamp${updated.totalStamps === 1 ? '' : 's'}`, { icon: '🎁', id: 'stamp-toast', duration: 6000 });
        }
        return updated;
      });
    };

    const onOrderChange = (order) => {
      if (order.status === 'completed' || order.status === 'cancelled') {
        setActiveOrders(prev => prev.filter(o => o._id !== order._id));
        setActiveOrder(prev => (prev?._id === order._id ? null : prev));
        if (order.status === 'completed') {
          toast.success('🧾 Your bill has been settled. Thank you for dining with us!', { duration: 6000, id: 'bill-settled' });
          refreshVisit();
        }
        return;
      }
      setActiveOrder(order);
      setActiveOrders(prev => {
        const exists = prev.some(o => o._id === order._id);
        return exists ? prev.map(o => (o._id === order._id ? order : o)) : [order, ...prev];
      });
    };

    const onStatus = (order) => {
      onOrderChange(order);
      if (order.status === 'pending') toast.success('✅ Order accepted! The kitchen will start preparing it.', { duration: 6000, id: `accepted-${order._id}` });
      else if (order.status === 'cancelled') toast.error('Your order was not accepted. Please ask our staff for help.', { duration: 8000, id: `rejected-${order._id}` });
      else if (order.status === 'ready') toast.success('🔔 Your food is ready!', { duration: 5000 });
      else if (order.status === 'preparing') toast('🍳 The kitchen is now preparing your food', { icon: '👨‍🍳' });
      else if (order.status === 'served') toast.success('🍽️ Food served! Enjoy your meal.');
    };

    socket.on('customer-update', onCustomerUpdate);
    socket.on('order-status-updated', onStatus);
    socket.on('order-updated', onOrderChange);
    socket.on('order-created', onOrderChange);
    return () => {
      socket.off('customer-update', onCustomerUpdate);
      socket.off('order-status-updated', onStatus);
      socket.off('order-updated', onOrderChange);
      socket.off('order-created', onOrderChange);
    };
  }, [socket, customer?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Loyalty settings are public and broadcast when the admin changes them
  useEffect(() => {
    if (!socket) return;
    const onSettings = (settings) => {
      if (settings) setLoyaltySettings(settings);
    };
    socket.on('loyalty-settings-updated', onSettings);
    return () => socket.off('loyalty-settings-updated', onSettings);
  }, [socket]);

  // Safety-net refresh when the tab regains focus, plus a slow background poll
  useEffect(() => {
    if (!customer?._id) return;
    refreshCustomer();
    const sync = () => {
      if (document.visibilityState === 'visible') {
        refreshCustomer();
        refreshActiveOrders();
        refreshVisit();
      }
    };
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    const interval = setInterval(sync, POLL_MS);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
      clearInterval(interval);
    };
  }, [customer?._id, refreshCustomer, refreshActiveOrders, refreshVisit]);

  // Add item with particular dish note
  const addToCart = (item, quantity = 1, dishNote = '') => {
    setCart(prev => {
      const cleanNote = (dishNote || '').trim();
      const itemId = item._id || item.menuItemId;
      const existing = prev.find(
        c => (c._id === itemId || c.menuItemId === itemId) && (c.notes || '') === cleanNote
      );

      if (existing) {
        return prev.map(c =>
          c === existing ? { ...c, quantity: c.quantity + quantity } : c
        );
      }

      return [
        ...prev,
        {
          _id: itemId,
          menuItemId: itemId,
          name: item.name,
          price: item.price,
          isVeg: item.isVeg !== false,
          image: item.image || null,
          category: item.category || '',
          quantity,
          notes: cleanNote
        }
      ];
    });
    toast.success(`Added ${item.name} to cart!`);
  };

  const getItemQuantity = (itemId) => {
    if (!itemId) return 0;
    return cart
      .filter(item => item._id === itemId || item.menuItemId === itemId)
      .reduce((sum, item) => sum + item.quantity, 0);
  };

  const updateQuantity = (itemId, newQty) => {
    setCart(prev => {
      if (newQty <= 0) {
        return prev.filter(item => item._id !== itemId && item.menuItemId !== itemId);
      }
      return prev.map(item => (item._id === itemId || item.menuItemId === itemId ? { ...item, quantity: newQty } : item));
    });
  };

  const updateItemNotes = (itemId, newNote) => {
    setCart(prev => prev.map(item => (item._id === itemId || item.menuItemId === itemId ? { ...item, notes: newNote } : item)));
  };

  // Index-based helpers used by the cart screen
  const updateCartQty = (index, delta) => {
    setCart(prev => prev
      .map((item, i) => (i === index ? { ...item, quantity: item.quantity + delta } : item))
      .filter(item => item.quantity > 0));
  };

  const updateDishNote = (index, note) => {
    setCart(prev => prev.map((item, i) => (i === index ? { ...item, notes: note } : item)));
  };

  const clearCart = () => setCart([]);

  // Running bill for the table (read-only — the waiter collects payment at the POS)
  const fetchTableBill = async () => {
    const res = await axios.get('/api/customers/me/table-bill');
    return res.data;
  };

  // "Call for Bill": alerts the waiters, who bring the bill to the table
  const callForBill = async ({ paymentPreference, rewardId }) => {
    const res = await axios.post('/api/customers/me/call-bill', { paymentPreference, rewardId });
    if (res.data?.order) {
      setActiveOrder(res.data.order);
      setActiveOrders(prev => prev.map(o => (o._id === res.data.order._id ? res.data.order : o)));
    }
    return res.data;
  };

  const getNextReward = () => {
    const totalStamps = customer?.totalStamps || 0;
    const stampsPerCard = loyaltySettings?.stampsPerCard || 8;
    const activeMilestones = (loyaltySettings?.milestones || [])
      .filter(m => m.isActive !== false)
      .sort((a, b) => a.requiredStamps - b.requiredStamps);

    const cardCycle = Math.floor(Math.max(0, totalStamps - 1) / stampsPerCard) + 1;
    const currentInCycle = totalStamps === 0 ? 0 : ((totalStamps - 1) % stampsPerCard) + 1;
    const nextMilestone = activeMilestones.find(m => m.requiredStamps > currentInCycle);

    if (nextMilestone) {
      return {
        cardCycle,
        rewardName: nextMilestone.title,
        targetStamps: nextMilestone.requiredStamps,
        stampsNeeded: nextMilestone.requiredStamps - currentInCycle,
        icon: nextMilestone.icon || '🎁'
      };
    }
    const highest = activeMilestones[activeMilestones.length - 1];
    return {
      cardCycle,
      rewardName: highest ? highest.title : 'Card Complete!',
      targetStamps: stampsPerCard,
      stampsNeeded: 0,
      icon: highest?.icon || '🎁'
    };
  };

  const gstRate = restaurantInfo.gstRate ?? 5;
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartSubtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartTax = Math.round(cartSubtotal * gstRate / 100);
  const cartTotal = cartSubtotal + cartTax;

  return (
    <CustomerContext.Provider
      value={{
        customer,
        tableNumber,
        tableKey,
        isCounter: tableNumber === COUNTER,
        // Visit over (table billed): menu and rewards only, no table number
        visitEnded: visit.visitEnded,
        logoutAt: visit.logoutAt,
        viewOnly: tableNumber === COUNTER || visit.visitEnded,
        setTableNumber,
        restaurantInfo,
        gstRate,
        cart,
        cartCount,
        cartSubtotal,
        cartTax,
        cartTotal,
        activeOrders,
        setActiveOrders,
        activeOrder,
        setActiveOrder,
        socket,
        loginCustomer,
        refreshCustomer,
        refreshActiveOrders,
        addToCart,
        getItemQuantity,
        updateQuantity,
        updateItemNotes,
        updateCartQty,
        updateDishNote,
        clearCart,
        logoutCustomer,
        fetchTableBill,
        callForBill,
        getNextReward,
        loyaltySettings,
        setLoyaltySettings
      }}
    >
      {children}
    </CustomerContext.Provider>
  );
}

export function useCustomer() {
  const ctx = useContext(CustomerContext);
  if (!ctx) throw new Error('useCustomer must be used within a CustomerProvider');
  return ctx;
}

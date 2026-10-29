'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createRealtimeSocket } from '@/lib/realtime-client';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

const PAYMENT_LABELS = { cash: '💵 Cash', upi: '📱 UPI', card: '💳 Card' };

// Short two-tone chime so a waiter notices a bill request even when not looking at the screen.
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.35);
    });
  } catch {
    // Audio not available (e.g. browser blocked autoplay) — the toast still shows.
  }
}

export function SocketProvider({ children, role }) {
  const [socket, setSocket] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    // The server decides which Realtime topics this login may join (see lib/realtime-client.js).
    const s = createRealtimeSocket();
    setSocket(s);
    return () => s.disconnect();
  }, [user?.id]);

  // Waiters and admins get an alert whenever a table taps "Call for Bill".
  useEffect(() => {
    if (!socket || role === 'kitchen') return;
    const onBillRequested = (req) => {
      playChime();
      const extras = [
        req.paymentPreference && `Pays by ${PAYMENT_LABELS[req.paymentPreference]}`,
        req.rewardTitle && `Reward: ${req.rewardTitle}`
      ].filter(Boolean).join(' • ');
      toast(
        `🧾 Table T${req.tableNumber} is asking for the bill${req.customerName ? ` (${req.customerName})` : ''} — ₹${req.totalAmount}${extras ? `\n${extras}` : ''}`,
        { duration: 15000, id: `bill-${req.orderId}`, style: { background: '#FFFBEB', border: '2px solid #F6AD55', fontWeight: 700, whiteSpace: 'pre-line' } }
      );
    };
    const onWaiterCalled = (req) => {
      playChime();
      toast(
        `🔔 Table T${req.tableNumber} is calling a waiter${req.customerName ? ` (${req.customerName})` : ''}`,
        { duration: 15000, id: `waiter-${req.tableNumber}`, style: { background: '#EFF6FF', border: '2px solid #63B3ED', fontWeight: 700 } }
      );
    };
    socket.on('bill-requested', onBillRequested);
    socket.on('waiter-called', onWaiterCalled);
    return () => {
      socket.off('bill-requested', onBillRequested);
      socket.off('waiter-called', onWaiterCalled);
    };
  }, [socket, role]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from '@/lib/router';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

const PAYMENT_LABELS = { cash: '💵 Cash', upi: '📱 UPI', card: '💳 Card' };

const ago = (d) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return `${h} h ${mins % 60} min ago`;
};

/**
 * 🔔 Tables that tapped "Call for Bill" and haven't been billed yet. The list stays until the
 * bill is generated (or the order is cancelled), so a request can't be missed like a pop-up.
 */
export default function BillRequestBell({ role, variant = 'sidebar' }) {
  const socket = useSocket();
  const navigate = useNavigate();
  const { restaurant } = useAuth();
  const gstRate = restaurant?.gstRate ?? 5;
  const [requests, setRequests] = useState([]);
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const boxRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await axios.get('/api/orders?active=true');
      setRequests((res.data || [])
        .filter(o => o.billRequested)
        .sort((a, b) => new Date(a.billRequestedAt) - new Date(b.billRequestedAt)));
    } catch {
      // keep the last list; the next event or poll refreshes it
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 30000);
    const clock = setInterval(() => setTick(t => t + 1), 60000); // keep "x min ago" fresh
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    const events = ['bill-requested', 'bill-created', 'order-updated', 'order-status-updated'];
    events.forEach(ev => socket.on(ev, load));
    return () => events.forEach(ev => socket.off(ev, load));
  }, [socket, load]);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const count = requests.length;
  const go = () => {
    setOpen(false);
    navigate(role === 'admin' ? '/admin/billing' : '/waiter/tables');
  };
  const dark = variant === 'sidebar';

  return (
    <div ref={boxRef} style={{ position: 'relative', marginLeft: variant === 'topbar' ? 'auto' : 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={count ? `${count} bill request${count > 1 ? 's' : ''}` : 'No bill requests'}
        title="Bill requests"
        style={{
          position: 'relative', width: 38, height: 38, borderRadius: 10, cursor: 'pointer',
          background: count ? 'rgba(246,173,85,0.18)' : dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)',
          border: count ? '1.5px solid #F6AD55' : '1px solid rgba(255,255,255,0.15)',
          color: 'white', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
      >
        🔔
        {count > 0 && (
          <span style={{
            position: 'absolute', top: -6, right: -6, minWidth: 19, height: 19, padding: '0 5px', borderRadius: 10,
            background: '#E53E3E', color: 'white', fontSize: 11, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #1A202C'
          }}>
            {count}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 46, [variant === 'topbar' ? 'right' : 'left']: 0, width: 300, maxWidth: '92vw',
          background: 'white', color: '#1A202C', borderRadius: 12, border: '1px solid #E2E8F0',
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)', zIndex: 1200, overflow: 'hidden'
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #EDF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 14 }}>🧾 Bill requests</strong>
            <span className={`badge ${count ? 'badge-orange' : 'badge-gray'}`}>{count} waiting</span>
          </div>
          {count === 0 ? (
            <div style={{ padding: '22px 14px', textAlign: 'center', color: '#718096', fontSize: 13 }}>
              No table is waiting for a bill.
            </div>
          ) : (
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {requests.map(o => {
                const total = Number(o.totalAmount || 0) + Math.round(Number(o.totalAmount || 0) * gstRate / 100);
                return (
                  <button key={o._id} onClick={go} style={{
                    width: '100%', textAlign: 'left', background: '#FFFBEB', border: 'none', borderBottom: '1px solid #FEEBC8',
                    padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8
                  }}>
                    <span>
                      <span style={{ display: 'block', fontWeight: 800, fontSize: 14 }}>
                        Table T{o.tableNumber}{o.customerName ? ` · ${o.customerName}` : ''}
                      </span>
                      <span style={{ display: 'block', fontSize: 12, color: '#9C4221', marginTop: 2 }}>
                        Order #{o.orderNumber} · {ago(o.billRequestedAt)}
                        {o.paymentPreference ? ` · ${PAYMENT_LABELS[o.paymentPreference]}` : ''}
                      </span>
                    </span>
                    <span style={{ fontWeight: 800, color: '#FF6B35', whiteSpace: 'nowrap' }}>₹{total}</span>
                  </button>
                );
              })}
            </div>
          )}
          <button onClick={go} style={{
            width: '100%', padding: '10px 14px', background: '#F7FAFC', border: 'none', borderTop: '1px solid #EDF2F7',
            color: '#2B6CB0', fontWeight: 700, fontSize: 13, cursor: 'pointer'
          }}>
            {role === 'admin' ? 'Open billing →' : 'Open tables →'}
          </button>
        </div>
      )}
    </div>
  );
}

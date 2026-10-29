'use client';

import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { playChime, useSocket } from '../../context/SocketContext';

// Orders a guest placed from their phone on a free table wait here until a waiter or the
// admin checks the table: Accept sends the order to the kitchen, Reject cancels it.
// (Stops orders from someone who photographed a table QR code and ordered from home.)
export default function OrderApprovals() {
  const socket = useSocket();
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await axios.get('/api/orders?status=awaiting');
      setOrders((res.data || []).filter(o => o.status === 'awaiting'));
    } catch {
      // the next event or reload will catch up
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return;
    const onAwaiting = (order) => {
      setOrders(prev => {
        if (!prev.some(o => o._id === order._id)) {
          playChime();
          toast(`🆕 New order at T-${order.tableNumber} — please check the table and accept it`, {
            id: `awaiting-${order._id}`, duration: 10000,
            style: { background: '#FFF7ED', border: '2px solid #FB923C', fontWeight: 700 }
          });
        }
        return [order, ...prev.filter(o => o._id !== order._id)];
      });
    };
    const onStatus = (order) => {
      if (order.status !== 'awaiting') setOrders(prev => prev.filter(o => o._id !== order._id));
    };
    socket.on('order-awaiting', onAwaiting);
    socket.on('order-status-updated', onStatus);
    return () => {
      socket.off('order-awaiting', onAwaiting);
      socket.off('order-status-updated', onStatus);
    };
  }, [socket]);

  const decide = async (order, accept) => {
    if (!accept && !window.confirm(`Reject order #${order.orderNumber} for T-${order.tableNumber}? The guest will be told it was not accepted.`)) return;
    setBusy(order._id);
    try {
      await axios.post(`/api/orders/${order._id}/approval`, { accept });
      toast.success(accept ? `Order #${order.orderNumber} sent to the kitchen` : `Order #${order.orderNumber} rejected`);
      setOrders(prev => prev.filter(o => o._id !== order._id));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update the order');
      load();
    } finally {
      setBusy(null);
    }
  };

  if (orders.length === 0) return null;

  return (
    <div className="approvals" role="region" aria-label="Orders waiting for approval">
      {orders.map(order => (
        <div key={order._id} className="approval-card">
          <div className="approval-head">
            <span className="approval-table">T-{order.tableNumber}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="approval-title">New order from a guest&apos;s phone</div>
              <div className="approval-sub">#{order.orderNumber} · {order.customerName || 'Guest'} · ₹{order.totalAmount}</div>
            </div>
          </div>
          <div className="approval-items">
            {(order.items || []).map((it, i) => <div key={i}>{it.quantity} × {it.name}</div>)}
          </div>
          <div className="approval-hint">Is someone sitting at T-{order.tableNumber}? Accept sends it to the kitchen.</div>
          <div className="approval-actions">
            <button className="btn btn-ghost btn-sm" disabled={busy === order._id} onClick={() => decide(order, false)}>✕ Reject</button>
            <button className="btn btn-primary btn-sm" disabled={busy === order._id} onClick={() => decide(order, true)}>✓ Accept</button>
          </div>
        </div>
      ))}
    </div>
  );
}

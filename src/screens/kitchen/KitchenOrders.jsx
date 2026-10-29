'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useSocket } from '../../context/SocketContext';

const STATUS_FLOW = {
  pending: { next: 'accepted', label: 'Accept', color: '#3182ce', bg: '#ebf8ff', border: '#bee3f8' },
  accepted: { next: 'preparing', label: 'Start Preparing', color: '#805ad5', bg: '#faf5ff', border: '#d6bcfa' },
  preparing: { next: 'ready', label: 'Mark Ready', color: '#38a169', bg: '#f0fff4', border: '#9ae6b4' },
  ready: { next: 'served', label: 'Mark Served', color: '#276749', bg: '#c6f6d5', border: '#68d391' },
};

const STATUS_HEADER_BG = {
  pending: { bg: '#fffaf0', border: '#ED8936', text: '#c05621' },
  accepted: { bg: '#ebf8ff', border: '#3182ce', text: '#2c5282' },
  preparing: { bg: '#faf5ff', border: '#805ad5', text: '#553c9a' },
  ready: { bg: '#f0fff4', border: '#38a169', text: '#276749' },
};

function KitchenCard({ order, onStatusChange }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const created = new Date(order.createdAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - created) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [order.createdAt]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const isUrgent = elapsed > 900;

  const headerStyle = STATUS_HEADER_BG[order.status] || STATUS_HEADER_BG.pending;
  const flow = STATUS_FLOW[order.status];

  const latestBatch = order.batchCount || 1;
  const isUpdatedOrder = latestBatch > 1 && order.lastUpdatedByWaiter != null;

  // Split items cleanly using batchNumber — no timestamp guessing
  // ✅ served=true → already delivered to customer
  // 🆕 served=false AND batchNumber === latestBatch AND order was updated → newly added this round
  // 🍳 served=false AND batchNumber < latestBatch → was ordered before, still being prepared
  // 🍳 served=false AND batchNumber === 1 AND no update yet → normal in-progress items
  const servedItems   = order.items.filter(item => item.served);
  const newItems      = order.items.filter(item => !item.served && isUpdatedOrder && item.batchNumber === latestBatch);
  const pendingItems  = order.items.filter(item => !item.served && !(isUpdatedOrder && item.batchNumber === latestBatch));

  const updatedMinsAgo = isUpdatedOrder
    ? Math.floor((Date.now() - new Date(order.lastUpdatedByWaiter).getTime()) / 60000)
    : null;

  const renderItem = (item, i, arr, style) => (
    <div key={`${item.name}-${item.batchNumber}-${i}`} style={{
      marginBottom: i < arr.length - 1 ? 8 : 0,
      padding: '10px 12px',
      borderRadius: 8,
      ...style.wrap
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: '0.93rem', ...style.name }}>{item.name}</span>
          {item.notes && (
            <div style={{
              fontSize: 11, fontStyle: 'italic', marginTop: 3,
              padding: '2px 7px', borderRadius: 4, display: 'inline-block',
              ...style.note
            }}>
              📝 {item.notes}
            </div>
          )}
        </div>
        <span style={{
          fontWeight: 800, fontSize: '1rem', marginLeft: 12,
          padding: '2px 10px', borderRadius: 20,
          ...style.qty
        }}>
          ×{item.quantity}
        </span>
      </div>
    </div>
  );

  return (
    <div className="kitchen-card" style={{
      background: 'white', borderRadius: 12, overflow: 'hidden',
      boxShadow: isUrgent
        ? '0 0 0 3px #FC8181, 0 4px 12px rgba(0,0,0,0.1)'
        : '0 2px 8px rgba(0,0,0,0.08)',
      border: `2px solid ${headerStyle.border}`, transition: 'all 0.3s'
    }}>

      {/* ── Header ── */}
      <div style={{ padding: '12px 16px', background: headerStyle.bg, borderBottom: `2px solid ${headerStyle.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {order.orderType === 'takeaway' ? (
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#6B46C1', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🛍️ PARCEL</span>
                <span style={{ fontSize: 12, background: '#FAF5FF', border: '1px solid #D6BCFA', padding: '1px 6px', borderRadius: 4 }}>
                  {order.takeawayToken || `#${order.orderNumber}`}
                </span>
              </div>
            ) : (
              <div style={{ fontWeight: 800, fontSize: '1rem', color: headerStyle.text }}>
                🪑 Table T{order.tableNumber}
              </div>
            )}
            <div style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>
              Order #{order.orderNumber}
              {order.customerName && <span style={{ marginLeft: 6, fontWeight: 600, color: '#4A5568' }}>• 👤 {order.customerName}</span>}
            </div>
            {order.notes && (
              <div style={{ fontSize: 11, color: '#C53030', fontWeight: 600, marginTop: 2, background: '#FFF5F5', padding: '2px 6px', borderRadius: 4, display: 'inline-block' }}>
                📌 {order.notes}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: isUrgent ? '#e53e3e' : '#718096' }}>
              ⏱ {mins}:{secs.toString().padStart(2, '0')}
            </div>
            <div style={{ fontSize: 10, marginTop: 2, color: headerStyle.text, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {order.status}
            </div>
          </div>
        </div>

        {/* Updated banner */}
        {isUpdatedOrder && (
          <div style={{
            marginTop: 8, padding: '5px 10px', borderRadius: 6,
            background: '#FFF5F5', border: '1px solid #FC8181',
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11, color: '#C53030', fontWeight: 700
          }}>
            ✏️ ORDER UPDATED — {updatedMinsAgo === 0 ? 'just now' : updatedMinsAgo === 1 ? '1 min ago' : `${updatedMinsAgo} mins ago`}
            <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#E53E3E' }}>
              Batch #{latestBatch}
            </span>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '14px 16px' }}>

        {/* 🆕 NEW items — added in latest batch */}
        {newItems.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: '#C05621', marginBottom: 6
            }}>
              🆕 Prepare Now — New Addition ({newItems.length} {newItems.length === 1 ? 'item' : 'items'})
            </div>
            {newItems.map((item, i, arr) => renderItem(item, i, arr, {
              wrap: { background: '#FFFBEB', border: '2px solid #F6AD55', boxShadow: '0 0 0 3px rgba(246,173,85,0.15)' },
              name: { color: '#C05621' },
              note: { color: '#DD6B20', background: '#FEEBC8' },
              qty:  { color: '#fff', background: '#ED8936' }
            }))}
          </div>
        )}

        {/* 🍳 PENDING items — in progress, not yet served */}
        {pendingItems.length > 0 && (
          <div style={{ marginBottom: servedItems.length > 0 ? 12 : 0 }}>
            {(newItems.length > 0 || servedItems.length > 0) && (
              <div style={{
                fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: '#2B6CB0', marginBottom: 6
              }}>
                🍳 In Progress ({pendingItems.length} {pendingItems.length === 1 ? 'item' : 'items'})
              </div>
            )}
            {pendingItems.map((item, i, arr) => renderItem(item, i, arr, {
              wrap: { background: '#EBF8FF', border: '1px solid #BEE3F8' },
              name: { color: '#2C5282' },
              note: { color: '#2B6CB0', background: '#BEE3F8' },
              qty:  { color: '#fff', background: '#3182ce' }
            }))}
          </div>
        )}

        {/* ✅ ALREADY SERVED items */}
        {servedItems.length > 0 && (
          <div>
            <div style={{
              fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: '#38a169', marginBottom: 6
            }}>
              ✅ Already Served ({servedItems.length} {servedItems.length === 1 ? 'item' : 'items'})
            </div>
            {servedItems.map((item, i, arr) => renderItem(item, i, arr, {
              wrap: { background: '#F0FFF4', border: '1px solid #9AE6B4', opacity: 0.8 },
              name: { color: '#276749', textDecoration: 'line-through', textDecorationColor: '#68D391' },
              note: { color: '#68D391', background: '#C6F6D5' },
              qty:  { color: '#276749', background: '#C6F6D5' }
            }))}
          </div>
        )}

        {/* All done */}
        {pendingItems.length === 0 && newItems.length === 0 && servedItems.length > 0 && (
          <div style={{ textAlign: 'center', padding: '8px 0', color: '#38a169', fontWeight: 700, fontSize: 13 }}>
            ✅ All items served for this order
          </div>
        )}
      </div>

      {/* ── Action button ── */}
      {flow && (
        <div style={{ padding: '0 16px 16px' }}>
          <button
            onClick={() => onStatusChange(order._id, flow.next)}
            style={{
              width: '100%', padding: '10px', borderRadius: 8, border: 'none',
              cursor: 'pointer', fontWeight: 700, fontSize: 13, color: 'white',
              background: flow.next === 'accepted' ? '#3182ce'
                : flow.next === 'preparing' ? '#805ad5'
                : flow.next === 'ready' ? '#38a169'
                : '#276749',
              transition: 'all 0.2s'
            }}>
            {flow.label} →
          </button>
        </div>
      )}
    </div>
  );
}

// One card per order, even if the same order arrives twice (socket reconnect, reload race...).
const uniqueById = (list) => {
  const seen = new Set();
  return list.filter(o => (seen.has(o._id) ? false : seen.add(o._id)));
};

export default function KitchenOrders() {
  const [rawOrders, setOrders] = useState([]);
  const orders = uniqueById(rawOrders);
  const [filter, setFilter] = useState('active');
  const socket = useSocket();

  const load = async () => {
    const res = await axios.get('/api/orders?active=true');
    const active = res.data.filter(o => !['completed', 'cancelled', 'served', 'awaiting'].includes(o.status));
    setOrders(uniqueById(active));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('new-order', (order) => {
      if (order.status === 'awaiting') return;
      setOrders(prev => [order, ...prev.filter(o => o._id !== order._id)]);
      toast.success(`🔔 New order! Table T${order.tableNumber} — #${order.orderNumber}`, { duration: 8000 });
    });

    socket.on('order-updated', (updated) => {
      if (updated.status === 'awaiting') return;
      // A served order that gets new items comes back to the kitchen as "preparing"
      setOrders(prev => {
        if (['completed', 'cancelled', 'served'].includes(updated.status)) return prev.filter(o => o._id !== updated._id);
        return prev.some(o => o._id === updated._id)
          ? prev.map(o => (o._id === updated._id ? updated : o))
          : [updated, ...prev];
      });
      const newCount = updated.items.filter(i => !i.served && i.batchNumber === updated.batchCount && updated.batchCount > 1).length;
      if (newCount > 0) {
        toast(`✏️ Order #${updated.orderNumber} updated — ${newCount} new item(s) added!`, {
          icon: '🆕', duration: 10000,
          style: { background: '#FFFBEB', border: '2px solid #F6AD55', fontWeight: 700 }
        });
      } else {
        toast('📝 Order updated', { icon: '✏️' });
      }
    });

    socket.on('order-status-updated', (updated) => {
      if (['completed', 'cancelled', 'served', 'awaiting'].includes(updated.status)) {
        setOrders(prev => prev.filter(o => o._id !== updated._id));
      } else {
        setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
      }
    });

    return () => {
      socket.off('new-order');
      socket.off('order-updated');
      socket.off('order-status-updated');
    };
  }, [socket]);

  const updateStatus = async (id, status) => {
    try {
      await axios.put(`/api/orders/${id}/status`, { status });
      toast.success(`Status → ${status}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update the order');
    }
  };

  const STATUS_ORDER = ['pending', 'accepted', 'preparing', 'ready'];
  const filtered = filter === 'active'
    ? orders
    : orders.filter(o => o.status === filter);

  const byStatus = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = filtered.filter(o => o.status === s);
    return acc;
  }, {});

  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = orders.filter(o => o.status === s).length;
    return acc;
  }, {});

  return (
    <div>
      <div className="page-header" style={{ background: '#1A202C', color: 'white', borderBottom: '1px solid #2D3748' }}>
        <h1 style={{ color: 'white', fontFamily: 'Playfair Display', fontSize: '1.4rem' }}>
          👨‍🍳 Kitchen Display
        </h1>
        <div className="flex-gap">
          {[
            { key: 'active',    label: `All Active (${orders.length})` },
            { key: 'pending',   label: `Pending (${counts.pending})` },
            { key: 'accepted',  label: `Accepted (${counts.accepted})` },
            { key: 'preparing', label: `Preparing (${counts.preparing})` },
            { key: 'ready',     label: `Ready (${counts.ready})` },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`btn btn-sm ${filter === f.key ? 'btn-primary' : ''}`}
              style={{
                color: filter === f.key ? 'white' : '#CBD5E0',
                background: filter === f.key ? '#FF6B35' : 'rgba(255,255,255,0.08)',
                border: 'none', fontSize: 12
              }}>
              {f.label}
            </button>
          ))}
          <button className="btn btn-sm" onClick={load}
            style={{ background: 'rgba(255,255,255,0.1)', color: '#CBD5E0', border: 'none' }}>
            🔄
          </button>
        </div>
      </div>

      <div style={{ padding: 20, background: '#F7F8FA', minHeight: 'calc(100vh - 70px)' }}>
        {orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: '#718096' }}>
            <div style={{ fontSize: '4rem', marginBottom: 16 }}>✅</div>
            <h2 style={{ fontFamily: 'Inter', fontWeight: 700 }}>No Active Orders</h2>
            <p style={{ marginTop: 8 }}>Waiting for new orders from waiters...</p>
          </div>
        ) : filter === 'active' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {STATUS_ORDER.map(status =>
              byStatus[status].map(order => (
                <KitchenCard key={order._id} order={order} onStatusChange={updateStatus} />
              ))
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {filtered.map(order => (
              <KitchenCard key={order._id} order={order} onStatusChange={updateStatus} />
            ))}
            {filtered.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: '#718096' }}>
                No orders with status: {filter}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
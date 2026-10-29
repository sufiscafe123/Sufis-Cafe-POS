'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useSocket } from '../../context/SocketContext';

const STATUS_COLORS = {
  pending:   'badge-orange',
  accepted:  'badge-blue',
  preparing: 'badge-purple',
  ready:     'badge-green',
  served:    'badge-green',
  completed: 'badge-gray',
  cancelled: 'badge-red',
};

const STATUS_ICON = {
  pending:   '⏳',
  accepted:  '✅',
  preparing: '👨‍🍳',
  ready:     '🔔',
  served:    '🍽️',
  completed: '✓',
  cancelled: '✕',
};

export default function WaiterOrders() {
  const [orders, setOrders]     = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(true);
  const socket = useSocket();

  const load = async () => {
    try {
      const res = await axios.get('/api/orders?active=true');
      setOrders(res.data);
    } catch {
      toast.error('Could not load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('order-status-updated', (updated) => {
      setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
      if (selected?._id === updated._id) setSelected(updated);
      if (updated.status === 'ready') {
        toast.success(`🔔 Order #${updated.orderNumber} — Table T${updated.tableNumber} is READY!`, { duration: 6000 });
      }
    });
    return () => socket.off('order-status-updated');
  }, [socket, selected]);

  const markServed = async (id) => {
    try {
      await axios.put(`/api/orders/${id}/status`, { status: 'served' });
      toast.success('Marked as served ✓');
      setSelected(null);
      load();
    } catch {
      toast.error('Could not update order');
    }
  };

  const readyOrders  = orders.filter(o => o.status === 'ready');
  const fmt = iso => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <h1>My Orders</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="text-sm text-muted">{orders.length} active</span>
          {readyOrders.length > 0 && (
            <span className="wo-ready-pill">
              🔔 {readyOrders.length} ready!
            </span>
          )}
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : orders.length === 0 ? (
          <div className="empty-state card">
            <div className="icon">📋</div>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>No active orders</p>
            <p className="text-sm text-muted">Go to Tables to start a new order.</p>
          </div>
        ) : (
          <>
            {/* ── Ready-to-serve alert ── */}
            {readyOrders.length > 0 && (
              <div className="wo-ready-banner">
                <div className="wo-ready-title">🔔 Ready to Serve</div>
                {readyOrders.map(o => (
                  <div key={o._id} className="wo-ready-row">
                    <div className="wo-ready-info">
                      <span className="wo-order-num">#{o.orderNumber}</span>
                      <span className="wo-table-chip">{o.orderType === 'takeaway' ? '🛍️ Parcel' : `T${o.tableNumber}`}</span>
                      <span className="text-sm text-muted">{o.items.length} items · ₹{o.totalAmount}</span>
                    </div>
                    <button className="btn btn-success wo-serve-btn" onClick={() => markServed(o._id)}>
                      ✓ Served
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ── Orders list + desktop side panel ── */}
            <div className="wo-layout" style={{ gridTemplateColumns: selected ? '1fr 340px' : '1fr' }}>

              {/* Cards column */}
              <div className="wo-cards">
                {orders.map(o => (
                  <div
                    key={o._id}
                    className={`wo-card${selected?._id === o._id ? ' wo-card-selected' : ''}`}
                    onClick={() => setSelected(selected?._id === o._id ? null : o)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && setSelected(selected?._id === o._id ? null : o)}
                  >
                    {/* Top row */}
                    <div className="wo-card-top">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="wo-order-num">#{o.orderNumber}</span>
                        <span className="wo-table-chip">{o.orderType === 'takeaway' ? `🛍️ Parcel ${o.takeawayToken ? `(${o.takeawayToken})` : ''}` : `T${o.tableNumber}`}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={`badge ${STATUS_COLORS[o.status]}`}>
                          {STATUS_ICON[o.status]} {o.status}
                        </span>
                        <strong style={{ color: '#FF6B35' }}>₹{o.totalAmount}</strong>
                      </div>
                    </div>

                    {/* Items preview */}
                    <div className="wo-card-items">
                      {o.items.slice(0, 3).map(i => `${i.name} ×${i.quantity}`).join(' · ')}
                      {o.items.length > 3 && ` +${o.items.length - 3} more`}
                    </div>

                    {/* Footer */}
                    <div className="wo-card-foot">
                      <span className="text-sm text-muted">🕐 {fmt(o.createdAt)}</span>
                      {o.customerCount > 0 && (
                        <span className="text-sm text-muted">👥 {o.customerCount}</span>
                      )}
                      {/* Mobile-only: inline expand detail */}
                      {selected?._id === o._id && (
                        <span className="wo-collapse-hint">▲ Hide</span>
                      )}
                    </div>

                    {/* Inline expanded detail — only on mobile */}
                    {selected?._id === o._id && (
                      <div className="wo-inline-detail" onClick={e => e.stopPropagation()}>
                        <hr className="wo-hr" />
                        <div className="wo-detail-meta">
                          <div className="wo-detail-row">
                            <span className="text-muted">Status</span>
                            <span className={`badge ${STATUS_COLORS[o.status]}`}>{o.status}</span>
                          </div>
                          <div className="wo-detail-row">
                            <span className="text-muted">Guests</span>
                            <span>{o.customerCount}</span>
                          </div>
                        </div>
                        {o.items.map((item, i) => (
                          <div key={i} className="wo-detail-item">
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</div>
                              {item.notes && (
                                <div style={{ fontSize: 11, color: '#FF6B35', fontStyle: 'italic' }}>📝 {item.notes}</div>
                              )}
                            </div>
                            <span style={{ fontSize: 13, color: '#718096' }}>×{item.quantity}</span>
                            <strong style={{ fontSize: 13, color: '#FF6B35' }}>₹{item.price * item.quantity}</strong>
                          </div>
                        ))}
                        <div className="wo-detail-total">
                          <span>Total</span>
                          <strong style={{ color: '#FF6B35' }}>₹{o.totalAmount}</strong>
                        </div>
                        {o.status === 'ready' && (
                          <button
                            className="btn btn-success"
                            style={{ width: '100%', minHeight: 48, marginTop: 8, fontSize: 15 }}
                            onClick={() => markServed(o._id)}
                          >
                            ✓ Mark as Served
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop side detail panel */}
              {selected && (
                <div className="card wo-side-panel">
                  <div className="flex-between" style={{ marginBottom: 16 }}>
                    <h3 style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '1rem' }}>
                      Order #{selected.orderNumber}
                    </h3>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕</button>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div className="flex-between text-sm" style={{ marginBottom: 6 }}>
                      <span className="text-muted">Table</span><strong>T{selected.tableNumber}</strong>
                    </div>
                    <div className="flex-between text-sm" style={{ marginBottom: 6 }}>
                      <span className="text-muted">Customers</span><span>{selected.customerCount}</span>
                    </div>
                    <div className="flex-between text-sm">
                      <span className="text-muted">Status</span>
                      <span className={`badge ${STATUS_COLORS[selected.status]}`}>{selected.status}</span>
                    </div>
                  </div>
                  <hr style={{ borderColor: '#E2E8F0', margin: '14px 0' }} />
                  {selected.items.map((item, i) => (
                    <div key={i} className="cart-item">
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</div>
                        {item.notes && (
                          <div style={{ fontSize: 11, color: '#FF6B35', fontStyle: 'italic' }}>📝 {item.notes}</div>
                        )}
                      </div>
                      <span style={{ fontSize: 13 }}>×{item.quantity}</span>
                      <strong style={{ fontSize: 13, color: '#FF6B35' }}>₹{item.price * item.quantity}</strong>
                    </div>
                  ))}
                  <hr style={{ borderColor: '#E2E8F0', margin: '14px 0' }} />
                  <div className="flex-between font-bold">
                    <span>Total</span>
                    <span style={{ color: '#FF6B35', fontSize: '1.1rem' }}>₹{selected.totalAmount}</span>
                  </div>
                  {selected.status === 'ready' && (
                    <button
                      className="btn btn-success w-full"
                      style={{ marginTop: 16 }}
                      onClick={() => { markServed(selected._id); setSelected(null); }}
                    >
                      ✓ Mark as Served
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
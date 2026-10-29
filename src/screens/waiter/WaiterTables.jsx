'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useSocket } from '../../context/SocketContext';
import OrderModal from './OrderModal';

export default function WaiterTables() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [pendingTable, setPendingTable] = useState(null);
  const [customerCount, setCustomerCount] = useState(2);
  const [loading, setLoading] = useState(true);
  const socket = useSocket();

  const load = async () => {
    try {
      const res = await axios.get('/api/tables');
      setTables(res.data);
    } catch {
      toast.error('Could not load tables');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('table-updated', load);
    return () => socket.off('table-updated', load);
  }, [socket]);

  const handleTableClick = (table) => {
    if (table.status === 'occupied') {
      setSelectedTable(table);
      setShowOrderModal(true);
    } else if (table.status === 'available') {
      setPendingTable(table);
      setCustomerCount(2);
      setShowCustomerModal(true);
    }
  };

  const startOrder = () => {
    setSelectedTable({ ...pendingTable, customerCount });
    setShowCustomerModal(false);
    setShowOrderModal(true);
  };

  const available = tables.filter(t => t.status === 'available').length;
  const occupied  = tables.filter(t => t.status === 'occupied').length;
  const reserved  = tables.filter(t => t.status === 'reserved').length;

  const statusConfig = {
    available: { label: 'Free',     color: '#276749', bg: '#f0fff4', border: '#68d391', dot: '#38a169', cta: 'Tap to order' },
    occupied:  { label: 'Occupied', color: '#c05621', bg: '#fff3ee', border: '#F6AD55', dot: '#FF6B35', cta: 'Add items'    },
    reserved:  { label: 'Reserved', color: '#744210', bg: '#fffff0', border: '#FBD38D', dot: '#ED8936', cta: null           },
  };

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <h1>Tables</h1>
        <div className="wt-legend">
          <span className="wt-legend-dot" style={{ background: '#38a169' }} />
          <span>{available} Free</span>
          <span className="wt-legend-dot" style={{ background: '#FF6B35', marginLeft: 10 }} />
          <span>{occupied} Busy</span>
          {reserved > 0 && (
            <>
              <span className="wt-legend-dot" style={{ background: '#ED8936', marginLeft: 10 }} />
              <span>{reserved} Reserved</span>
            </>
          )}
        </div>
      </div>

      <div className="page-body">
        {/* ── Hint bar ── */}
        <div className="wt-hint">
          Tap a <strong style={{ color: '#276749' }}>green</strong> table to start an order &nbsp;·&nbsp;
          tap an <strong style={{ color: '#c05621' }}>orange</strong> table to add items
        </div>

        {/* ── Loading ── */}
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : tables.length === 0 ? (
          <div className="empty-state card">
            <div className="icon">🪑</div>
            <p>No tables yet. Ask your admin to add tables.</p>
          </div>
        ) : (
          <div className="wt-grid">
            {tables.map(t => {
              const cfg = statusConfig[t.status] || statusConfig.reserved;
              const clickable = t.status !== 'reserved';
              return (
                <button
                  key={t._id}
                  className="wt-card"
                  style={{
                    background: cfg.bg,
                    borderColor: cfg.border,
                    cursor: clickable ? 'pointer' : 'not-allowed',
                    opacity: t.status === 'reserved' ? 0.65 : 1,
                  }}
                  onClick={() => clickable && handleTableClick(t)}
                  disabled={!clickable}
                  aria-label={`Table ${t.tableNumber}, ${t.status}`}
                >
                  <div className="wt-card-label">TABLE</div>
                  <div className="wt-card-number">T{t.tableNumber}</div>

                  <div className="wt-card-status">
                    <span className="wt-card-dot" style={{ background: cfg.dot }} />
                    <span style={{ color: cfg.color, fontWeight: 700, fontSize: 12 }}>{cfg.label}</span>
                  </div>

                  <div className="wt-card-cap">
                    <span>👤</span> {t.capacity} seats
                  </div>

                  {t.status === 'occupied' && t.customerCount > 0 && (
                    <div className="wt-card-guests">👥 {t.customerCount} guests</div>
                  )}

                  {t.billRequested && (
                    <div className="wt-card-guests" style={{ background: '#FEEBC8', color: '#9C4221', fontWeight: 800 }}>🙋 Bill requested</div>
                  )}

                  {cfg.cta && (
                    <div className="wt-card-cta" style={{ color: cfg.color }}>
                      {cfg.cta} →
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Customer count modal ── */}
      {showCustomerModal && pendingTable && (
        <div className="modal-overlay" onClick={() => setShowCustomerModal(false)}>
          <div className="modal wt-guest-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🪑 Table T{pendingTable.tableNumber}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCustomerModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-muted" style={{ marginBottom: 20 }}>How many guests are seated?</p>
              <div className="wt-guest-picker">
                <button
                  className="wt-guest-btn"
                  onClick={() => setCustomerCount(c => Math.max(1, c - 1))}
                  aria-label="Decrease"
                >−</button>
                <div className="wt-guest-count">
                  <span className="wt-guest-num">{customerCount}</span>
                  <span className="wt-guest-sub">guests</span>
                </div>
                <button
                  className="wt-guest-btn"
                  onClick={() => setCustomerCount(c => Math.min(pendingTable.capacity, c + 1))}
                  aria-label="Increase"
                >+</button>
              </div>
              <p className="text-sm text-muted text-center" style={{ marginTop: 8 }}>
                Max capacity: {pendingTable.capacity}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCustomerModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={startOrder}>
                Start Order →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Order modal ── */}
      {showOrderModal && selectedTable && (
        <OrderModal
          table={selectedTable}
          onClose={() => { setShowOrderModal(false); setSelectedTable(null); }}
          onSuccess={() => { setShowOrderModal(false); setSelectedTable(null); load(); }}
        />
      )}
    </div>
  );
}
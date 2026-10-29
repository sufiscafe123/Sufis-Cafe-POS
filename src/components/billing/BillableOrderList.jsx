'use client';

import React from 'react';

// Open orders waiting for a bill. Tables that tapped "Call for Bill" are listed first.
export const sortForBilling = (orders) => [...orders].sort((a, b) => {
  if (a.billRequested !== b.billRequested) return a.billRequested ? -1 : 1;
  if (a.billRequested) return new Date(a.billRequestedAt) - new Date(b.billRequestedAt);
  return new Date(b.createdAt) - new Date(a.createdAt);
});

export default function BillableOrderList({ orders, selectedId, onSelect }) {
  if (orders.length === 0) {
    return (
      <div className="empty-state card">
        <div className="icon">📋</div>
        <p>No open orders to bill</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sortForBilling(orders).map(o => {
        const isTakeaway = o.orderType === 'takeaway';
        const isSelected = selectedId === o._id;
        const accent = o.billRequested ? '#DD6B20' : isTakeaway ? '#805ad5' : '#FF6B35';
        return (
          <div key={o._id} onClick={() => onSelect(o)}
            style={{
              padding: 14, borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
              border: `2px solid ${isSelected || o.billRequested ? accent : '#E2E8F0'}`,
              background: isSelected ? (isTakeaway ? '#FAF5FF' : '#fff3ee') : o.billRequested ? '#FFFBEB' : 'white'
            }}>
            <div className="flex-between">
              <strong>
                {isTakeaway
                  ? `🛍️ Parcel ${o.takeawayToken ? `(${o.takeawayToken})` : `#${o.orderNumber}`}${o.customerName ? ` • ${o.customerName}` : ''}`
                  : `Order #${o.orderNumber} — Table T${o.tableNumber}`}
              </strong>
              <span className="badge badge-orange">₹{o.totalAmount}</span>
            </div>
            <div className="text-sm text-muted" style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>{o.items.length} items • <span style={{ textTransform: 'capitalize' }}>{o.status}</span></span>
              {o.billRequested && (
                <span className="badge" style={{ background: '#FEEBC8', color: '#9C4221', fontWeight: 700 }}>
                  🙋 Bill requested {o.billRequestedAt ? new Date(o.billRequestedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                  {o.paymentPreference ? ` • ${o.paymentPreference.toUpperCase()}` : ''}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

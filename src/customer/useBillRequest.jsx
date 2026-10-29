'use client';

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useCustomer } from './CustomerContext';

/**
 * One-tap "Call for Bill": a small confirmation, then the waiters and admin are alerted
 * (chime, pop-up and the 🔔 bill-request list). The guest stays on the screen they're on.
 */
export function useBillRequest() {
  const { activeOrder, callForBill, gstRate, loyaltySettings } = useCustomer();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const hasOrder = Boolean(activeOrder);
  const requested = Boolean(activeOrder?.billRequested);
  const subtotal = Number(activeOrder?.totalAmount || 0);
  const total = subtotal + Math.round(subtotal * (gstRate || 0) / 100);
  // Same rule the bill uses: a stamp is added when the bill is generated, if it meets the minimum spend
  const minSpend = Number(loyaltySettings?.minSpendForStamp ?? 200);
  const stampEligible = hasOrder && total >= minSpend;
  // Requested but not billed yet → the stamp is pending until the cashier generates the bill
  const stampPending = requested && stampEligible;

  const start = () => {
    if (!hasOrder) {
      toast.error('Place an order first. The bill can be requested once you have ordered.', { id: 'bill-no-order' });
      return;
    }
    setOpen(true);
  };

  const confirm = async () => {
    if (sending) return;
    setSending(true);
    try {
      await callForBill({ paymentPreference: '', rewardId: undefined });
      toast.success(requested ? 'Reminder sent to the waiter' : 'Waiter notified. Your bill is on the way.', { id: 'bill-requested', duration: 5000 });
      setOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not reach the waiter. Please try again.', { id: 'bill-requested' });
    } finally {
      setSending(false);
    }
  };

  const sheet = open ? (
    <div className="cust-modal-backdrop" onClick={() => !sending && setOpen(false)}>
      <div className="cust-modal-sheet" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ width: 40, height: 4, background: '#CBD5E0', borderRadius: 2 }} />
        </div>
        <div style={{
          width: 64, height: 64, borderRadius: 20, background: '#EEF6F1', margin: '0 auto 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32
        }}>
          {requested ? '🔔' : '🧾'}
        </div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1A2E22', marginBottom: 6 }}>
          {requested ? 'Remind the waiter?' : 'Request the bill?'}
        </h3>
        <p style={{ fontSize: '0.9rem', color: '#5A6E62', marginBottom: 14 }}>
          {requested
            ? 'The waiter already knows. We can send them a reminder.'
            : 'A waiter will bring your bill to the table. You pay them directly.'}
        </p>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC',
          border: '1px solid #E2E8F0', borderRadius: 14, padding: '12px 16px', marginBottom: 18
        }}>
          <span style={{ color: '#64748B', fontWeight: 600 }}>Order #{activeOrder?.orderNumber}</span>
          <span style={{ fontWeight: 900, fontSize: '1.15rem', color: '#2D6144' }}>₹{total}</span>
        </div>
        {!requested && (
          <div style={{
            background: stampEligible ? '#FFF8E6' : '#F8FAFC', border: `1px solid ${stampEligible ? '#F6D78B' : '#E2E8F0'}`,
            color: stampEligible ? '#92400E' : '#64748B', borderRadius: 12, padding: '10px 12px', fontSize: '0.85rem',
            fontWeight: 700, marginTop: -6, marginBottom: 16
          }}>
            {stampEligible
              ? '⭐ +1 loyalty stamp on this bill. It is added when the bill is generated.'
              : `Spend ₹${Math.max(0, minSpend - total)} more to earn a loyalty stamp`}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-customer-secondary" style={{ flex: 1 }} disabled={sending} onClick={() => setOpen(false)}>
            Not now
          </button>
          <button className="btn-customer-primary" style={{ flex: 1.4 }} disabled={sending} onClick={confirm}>
            {sending ? 'Sending…' : requested ? '🔔 Send reminder' : '🙋 Yes, call waiter'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { start, requested, hasOrder, sheet, stampEligible, stampPending };
}

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from '@/lib/router';
import toast from 'react-hot-toast';
import { useCustomer } from './CustomerContext';

const PAYMENT_OPTIONS = [
  { id: 'cash', label: 'Cash', icon: '💵' },
  { id: 'upi', label: 'UPI', icon: '📱' },
  { id: 'card', label: 'Card', icon: '💳' }
];

const card = {
  background: '#ffffff',
  borderRadius: 20,
  padding: '18px',
  boxShadow: 'var(--shadow-sm)',
  marginBottom: 16,
  border: '1px solid #f1f5f9'
};

// Customer view of the running table bill with a "Call for Bill" button.
// Payment is NOT taken here: the waiter brings the bill and collects cash / UPI / card at the POS.
const CustomerCallBill = () => {
  const navigate = useNavigate();
  const { customer, tableNumber, fetchTableBill, callForBill, activeOrder } = useCustomer();

  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paymentPreference, setPaymentPreference] = useState('');
  const [sending, setSending] = useState(false);

  const loadBill = useCallback(async () => {
    try {
      const data = await fetchTableBill();
      setBill(data);
      if (data.billRequested) {
        setPaymentPreference(data.paymentPreference || '');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load your bill');
    } finally {
      setLoading(false);
    }
  }, [fetchTableBill]);

  useEffect(() => { loadBill(); }, [loadBill]);

  // Reload when the order changes live (new items, bill settled by the waiter, ...)
  useEffect(() => {
    if (!loading) loadBill();
  }, [activeOrder?.updatedAt, activeOrder?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCallBill = async () => {
    setSending(true);
    try {
      await callForBill({ paymentPreference });
      toast.success('A waiter is on the way with your bill 🧾', { duration: 5000 });
      await loadBill();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not reach the staff. Please wave to a waiter.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="customer-page-content" style={{ textAlign: 'center', padding: 60 }}>Loading your bill…</div>;
  }

  if (!bill?.hasActiveOrder) {
    return (
      <div className="customer-page-content" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%', background: '#E9EBDD', color: '#2D6144',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, margin: '0 auto 16px'
        }}>
          🧾
        </div>
        <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#1A2E22', marginBottom: 8 }}>
          No Open Bill
        </h3>
        <p style={{ color: '#64748B', fontSize: '0.92rem', maxWidth: 360, margin: '0 auto 24px', lineHeight: 1.5 }}>
          There is no open order for Table {tableNumber}. Once you order, your running bill will appear here.
        </p>
        <button onClick={() => navigate('/customer/menu')} className="btn-customer-primary" style={{ width: 'auto', padding: '12px 24px' }}>
          🍽️ Browse Menu
        </button>
      </div>
    );
  }


  return (
    <div className="customer-page-content">
      <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: 'var(--light-green)', color: 'var(--primary-green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.1rem'
          }}>
            T{tableNumber}
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.98rem' }}>Your Table Bill</div>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Dine-In • {customer?.name}</div>
          </div>
        </div>
        <button
          onClick={loadBill}
          style={{ background: 'none', border: 'none', color: 'var(--primary-green)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
        >
          🔄 Refresh
        </button>
      </div>

      {bill.billRequested && (
        <div style={{
          ...card,
          background: '#FFFBEB',
          border: '1.5px solid #F6AD55',
          display: 'flex',
          gap: 12,
          alignItems: 'center'
        }}>
          <span style={{ fontSize: 30 }}>🙋</span>
          <div>
            <div style={{ fontWeight: 800, color: '#92400E' }}>Bill requested</div>
            <div style={{ fontSize: '0.82rem', color: '#92400E' }}>
              A waiter is on the way with your bill. You can pay by cash, UPI or card at the table.
            </div>
          </div>
        </div>
      )}

      <div style={{ ...card, boxShadow: 'var(--shadow-md)' }}>
        <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>Items Ordered</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {bill.items.map((item, idx) => (
            <div key={item._id || idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
              <div>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>{item.name}</span>
                <span style={{ color: '#64748b', marginLeft: 6 }}>×{item.quantity}</span>
                {item.notes && <div style={{ fontSize: '0.74rem', color: '#047857', fontWeight: 500 }}>📝 {item.notes}</div>}
              </div>
              <div style={{ fontWeight: 700, color: '#1e293b' }}>₹{item.price * item.quantity}</div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.88rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
            <span>Subtotal</span>
            <span style={{ fontWeight: 600, color: '#1e293b' }}>₹{bill.subtotal}</span>
          </div>
          {bill.gstRate > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
              <span>GST ({bill.gstRate}%)</span>
              <span style={{ fontWeight: 600, color: '#1e293b' }}>₹{bill.gstAmount}</span>
            </div>
          )}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, marginTop: 6,
            borderTop: '1px solid #cbd5e1', fontSize: '1.2rem', fontWeight: 900
          }}>
            <span style={{ color: '#1e293b' }}>Estimated Total</span>
            <span style={{ color: 'var(--primary-green)' }}>₹{bill.totalAmount}</span>
          </div>
        </div>
      </div>

      <div style={card}>
        <h4 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#1e293b', margin: '0 0 4px' }}>How would you like to pay?</h4>
        <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 12px' }}>
          Optional — so the waiter brings the card machine or UPI QR.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {PAYMENT_OPTIONS.map(opt => {
            const isSelected = paymentPreference === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() => setPaymentPreference(isSelected ? '' : opt.id)}
                style={{
                  border: isSelected ? '2px solid var(--primary-green)' : '1px solid #e2e8f0',
                  background: isSelected ? 'var(--light-green)' : '#f8fafc',
                  borderRadius: 14, padding: '14px 8px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 4 }}>{opt.icon}</div>
                <div style={{ fontWeight: 800, fontSize: '0.85rem', color: isSelected ? 'var(--dark-green)' : '#1e293b' }}>{opt.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        className="btn-customer-primary"
        onClick={handleCallBill}
        disabled={sending}
        style={{ boxShadow: '0 8px 24px rgba(45,97,68,0.35)', padding: '16px' }}
      >
        {sending ? 'Calling the waiter…' : bill.billRequested ? '🔔 Remind the Waiter' : '🙋 Call for Bill'}
      </button>

      <div style={{ marginTop: 14, textAlign: 'center', fontSize: '0.78rem', color: 'var(--primary-green)', fontWeight: 700 }}>
        ✨ You earn a loyalty stamp when your bill is settled.
      </div>
    </div>
  );
};

export default CustomerCallBill;

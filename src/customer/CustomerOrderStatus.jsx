'use client';

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from '@/lib/router';
import { useCustomer } from './CustomerContext';
import { useBillRequest } from './useBillRequest';
import { ArrowRight, BellRing, ChefHat, Check, ClipboardCheck, Coffee, ReceiptIndianRupee, UtensilsCrossed } from 'lucide-react';

const STATUS_STEPS = [
  { key: 'placed', label: 'Order Received', Icon: ClipboardCheck, desc: 'Received by the kitchen' },
  { key: 'preparing', label: 'Preparing', Icon: ChefHat, desc: 'Freshly preparing your order' },
  { key: 'ready', label: 'Ready', Icon: BellRing, desc: 'Ready to be served at your table' },
  { key: 'served', label: 'Served', Icon: UtensilsCrossed, desc: 'Enjoy your meal!' }
];

const getStepIndex = (status) => {
  const norm = (status || '').toLowerCase();
  if (norm === 'served' || norm === 'completed') return 3;
  if (norm === 'ready') return 2;
  if (norm === 'preparing' || norm === 'cooking') return 1;
  return 0; // placed / order received
};

const CustomerOrderStatus = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { tableNumber, activeOrders, refreshActiveOrders } = useCustomer();
  const billRequest = useBillRequest();

  // Pick order from route state or first active order from context
  const [justPlaced, setJustPlaced] = useState(Boolean(location.state?.justPlaced));
  const [currentOrder, setCurrentOrder] = useState(
    location.state?.order || (activeOrders && activeOrders.length > 0 ? activeOrders[0] : null)
  );

  // Live status comes from the shared customer socket (CustomerContext); refresh once on open
  useEffect(() => {
    refreshActiveOrders();
  }, [refreshActiveOrders]);

  useEffect(() => {
    if (activeOrders && activeOrders.length > 0) {
      setCurrentOrder(activeOrders[0]);
    }
  }, [activeOrders]);

  const currentStep = getStepIndex(currentOrder?.status);

  if (!currentOrder) {
    return (
      <div className="customer-page-content st-page">
        <div className="st-sage st-os-empty">
          <div className="st-os-empty-icon"><ChefHat size={36} strokeWidth={1.6} aria-hidden="true" /></div>
          <h3 className="st-serif-title">No active order yet</h3>
          <p className="st-muted" style={{ fontSize: 14, margin: '8px auto 18px', maxWidth: 320, lineHeight: 1.45 }}>
            You have no orders in the kitchen for T-{tableNumber}. Browse our menu and order your favourites!
          </p>
          <button className="sl-button" style={{ width: 'auto', padding: '0 28px', margin: '0 auto' }} onClick={() => navigate('/customer/menu')}>
            Browse Menu <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  // A guest's first order on a free table waits for a waiter to accept it
  const awaiting = currentOrder?.status === 'awaiting';
  const orderItemsTotal = currentOrder?.items?.reduce((sum, it) => sum + ((it.price || 0) * (it.quantity || 1)), 0) || currentOrder?.totalAmount || 0;

  return (
    <div className="customer-page-content st-page">
      {/* Just placed: confirmation banner */}
      {justPlaced && (
        <div className="st-os-sent">
          <div className="st-os-sent-check"><Check size={28} strokeWidth={2.6} aria-hidden="true" /></div>
          <h2 className="st-os-sent-title">{awaiting ? 'Order Sent!' : 'Order Sent to Kitchen!'}</h2>
          <p>{awaiting
            ? 'A waiter will check your table and confirm it. Then the kitchen starts preparing it.'
            : 'Your order has been placed. Our kitchen will start preparing it soon.'}</p>
          <button onClick={() => setJustPlaced(false)}>Track live status ↓</button>
        </div>
      )}

      {/* Order status */}
      <div className="st-card st-block">
        <div className="st-os-head">
          <div>
            <div className="st-eyebrow">Order</div>
            <div className="st-serif-title" style={{ fontSize: 28 }}>
              #{currentOrder?.orderNumber || (currentOrder?._id ? currentOrder._id.slice(-6).toUpperCase() : 'ORD')}
            </div>
            <div className="st-muted">
              T-{tableNumber || currentOrder?.tableNumber} • {new Date(currentOrder?.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <span className="st-badge ready">{awaiting ? 'Waiting for staff' : STATUS_STEPS[currentStep].label}</span>
        </div>

        {awaiting && (
          <div className="st-notice" style={{ margin: '14px 0 0' }}>
            ⏳ Waiting for our staff to confirm your order. A waiter will check your table shortly.
          </div>
        )}

        {/* Live kitchen progress */}
        <h4 className="st-block-title" style={{ margin: '18px 0 14px' }}>
          <span className="st-live-dot" /> Live Kitchen Progress
        </h4>
        <div className="st-timeline">
          <div className="st-timeline-line">
            <div style={{ height: `${(currentStep / (STATUS_STEPS.length - 1)) * 100}%` }} />
          </div>
          {STATUS_STEPS.map((step, idx) => {
            const state = idx < currentStep ? 'past' : idx === currentStep ? 'current' : 'future';
            const Icon = step.Icon;
            return (
              <div key={step.key} className={`st-step ${state}`}>
                <div className="st-step-dot">
                  {state === 'past' ? <Check size={17} strokeWidth={2.6} aria-hidden="true" /> : <Icon size={17} strokeWidth={1.9} aria-hidden="true" />}
                </div>
                <div>
                  <div className="st-step-label">{step.label}</div>
                  <div className="st-muted">{step.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Items */}
        <div className="st-os-items">
          <div className="st-eyebrow" style={{ marginBottom: 8 }}>Items in this order ({currentOrder?.items?.length || 0})</div>
          {(currentOrder?.items || []).map((item, idx) => (
            <div key={idx} className="st-receipt-row st-os-item">
              <div>
                <span style={{ fontWeight: 600 }}>{item.name || item.menu?.name}</span>
                <span className="st-muted" style={{ marginLeft: 6 }}>×{item.quantity}</span>
                {item.batchNumber > 1 && <span className="st-round">Round {item.batchNumber}</span>}
                {item.notes && <div style={{ fontSize: '0.75rem', color: '#2D6144', marginTop: 2 }}>📝 {item.notes}</div>}
              </div>
              <div style={{ fontWeight: 700 }}>₹{(item.price || 0) * (item.quantity || 1)}</div>
            </div>
          ))}
          <div className="st-receipt-total" style={{ margin: '10px 0 0', paddingTop: 10, borderTop: '1px solid #D8DCCD' }}>
            <span>Order Total</span>
            <span className="st-strong-green" style={{ fontSize: 16 }}>₹{orderItemsTotal}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="sl-button" onClick={billRequest.start}>
          <ReceiptIndianRupee size={19} aria-hidden="true" />
          {billRequest.requested ? 'Waiter notified · Send reminder' : 'Ask for Bill'}
        </button>
        {billRequest.sheet}
        <button className="st-btn-outline" style={{ width: '100%', padding: 13 }} onClick={() => navigate('/customer/menu')}>
          <Coffee size={17} aria-hidden="true" /> Order More
        </button>
      </div>
    </div>
  );
};

export default CustomerOrderStatus;

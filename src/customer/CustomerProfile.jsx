'use client';

import React, { useState, useEffect } from 'react';
import { useNavigate } from '@/lib/router';
import axios from 'axios';
import { useCustomer } from './CustomerContext';
import CoffeeBean from './CoffeeBean';
import { ChevronRight, Gift, LogOut, X } from 'lucide-react';

const CustomerProfile = () => {
  const navigate = useNavigate();
  const { customer, tableNumber, isCounter, logoutCustomer, loyaltySettings } = useCustomer();
  const [selectedPastOrder, setSelectedPastOrder] = useState(null);
  const [orderHistory, setOrderHistory] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  const totalStamps = customer?.totalStamps || 0;
  const stampsPerCard = loyaltySettings?.stampsPerCard || 8;
  const activeMilestones = (loyaltySettings?.milestones || []).filter(m => m.isActive !== false);
  const cardCycle = Math.floor(Math.max(0, totalStamps - 1) / stampsPerCard) + 1;
  const currentStampsInCycle = totalStamps === 0 ? 0 : ((totalStamps - 1) % stampsPerCard) + 1;

  // Fetch real dining orders for this customer from database
  useEffect(() => {
    const fetchOrders = async () => {
      const custId = customer?._id || customer?.customerId;
      if (!custId) {
        setLoadingOrders(false);
        return;
      }
      try {
        setLoadingOrders(true);
        const res = await axios.get(`/api/customers/${custId}/orders`);
        if (res.data?.orders) {
          setOrderHistory(res.data.orders);
        }
      } catch (err) {
        console.warn('Error fetching customer orders:', err.message);
      } finally {
        setLoadingOrders(false);
      }
    };

    fetchOrders();
  }, [customer?._id, customer?.customerId]);

  return (
    <div className="customer-page-content st-page">
      {/* Profile card */}
      <div className="st-sage st-profile">
        <div className="st-avatar">{customer?.name ? customer.name.charAt(0).toUpperCase() : 'G'}</div>
        <h3 className="st-serif-title" style={{ fontSize: 28 }}>{customer?.name || 'Guest'}</h3>
        <div className="st-muted" style={{ fontSize: 14 }}>+91 {customer?.phone}</div>
        <div className="st-pill" style={{ marginTop: 12 }}>
          {isCounter ? 'Checked in at the counter' : `Seated at Table No. ${tableNumber}`}
        </div>
      </div>

      {/* Loyalty progress */}
      <div className="st-card st-block">
        <div className="st-block-head">
          <h4 className="st-block-title">Loyalty Progress</h4>
          <span className="st-strong-green">{currentStampsInCycle} / {stampsPerCard} stamps {cardCycle > 1 ? `· Card ${cardCycle}` : ''}</span>
        </div>

        <div className="st-mini-stamps">
          {Array.from({ length: stampsPerCard }, (_, i) => i + 1).map((s) => {
            const isEarned = currentStampsInCycle >= s;
            const isRewardSlot = activeMilestones.some(m => m.requiredStamps === s);
            return (
              <div key={s} className={`st-mini ${isEarned ? 'earned' : ''} ${isRewardSlot ? 'goal' : ''}`}>
                {isRewardSlot
                  ? <Gift size={15} strokeWidth={2} aria-hidden="true" />
                  : isEarned ? <CoffeeBean size={17} /> : s}
              </div>
            );
          })}
        </div>

        <button className="st-btn-outline" style={{ width: '100%' }} onClick={() => navigate('/customer/rewards')}>
          View My Rewards <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Order history */}
      <div className="st-card st-block">
        <h4 className="st-block-title" style={{ marginBottom: 12 }}>Previous Orders</h4>

        {loadingOrders ? (
          <div className="st-empty">Loading your orders...</div>
        ) : orderHistory.length === 0 ? (
          <div className="st-empty st-empty-dashed">
            <CoffeeBean size={30} />
            <div className="st-empty-title">No orders yet</div>
            <p>Your orders will appear here once you place them.</p>
            <button className="st-btn-small" onClick={() => navigate('/customer/menu')}>Browse Menu</button>
          </div>
        ) : (
          <div className="st-list">
            {orderHistory.map((order) => (
              <div key={order.id} className="st-order" onClick={() => setSelectedPastOrder(order)}>
                <div className="st-order-row">
                  <div>
                    <div className="st-reward-title">Order #{order.id}</div>
                    <div className="st-muted">{order.date} • Table {order.table}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="st-strong-green">₹{order.amount}</div>
                    <span className={`st-badge ${order.status === 'Paid' ? 'done' : 'ready'}`}>{order.status}</span>
                  </div>
                </div>
                <div className="st-muted" style={{ marginTop: 6 }}>
                  {order.items && order.items.length > 0
                    ? order.items.map(it => `${it.name} (×${it.qty})`).join(', ')
                    : 'Order details placed'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Switch Profile / Logout */}
      <button className="st-signout" onClick={logoutCustomer}>
        <LogOut size={16} aria-hidden="true" /> Sign Out / Change Mobile Number
      </button>

      {/* Past order receipt */}
      {selectedPastOrder && (
        <div className="st-modal-backdrop" onClick={() => setSelectedPastOrder(null)}>
          <div className="st-modal" onClick={e => e.stopPropagation()}>
            <div className="st-block-head">
              <h4 className="st-serif-title" style={{ fontSize: 24 }}>Order #{selectedPastOrder.id}</h4>
              <button className="st-icon-btn" onClick={() => setSelectedPastOrder(null)} aria-label="Close"><X size={18} aria-hidden="true" /></button>
            </div>

            <div className="st-muted" style={{ marginBottom: 14 }}>
              {selectedPastOrder.date} • Table {selectedPastOrder.table} • Paid via {selectedPastOrder.paymentMethod}
            </div>

            <div className="st-receipt">
              {selectedPastOrder.items.map((it, idx) => (
                <div key={idx} className="st-receipt-row">
                  <div>
                    <span style={{ fontWeight: 600 }}>{it.name}</span>
                    <span className="st-muted" style={{ marginLeft: 6 }}>×{it.qty}</span>
                    {it.notes && <div style={{ fontSize: '0.72rem', color: '#2D6144' }}>📝 {it.notes}</div>}
                  </div>
                  <div style={{ fontWeight: 700 }}>₹{it.price * it.qty}</div>
                </div>
              ))}
            </div>

            <div className="st-receipt-total">
              <span>Total Paid</span>
              <span className="st-strong-green">₹{selectedPastOrder.amount}</span>
            </div>

            <button className="sl-button" onClick={() => setSelectedPastOrder(null)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerProfile;

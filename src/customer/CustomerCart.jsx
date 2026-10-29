'use client';

import React, { useState } from 'react';
import { useNavigate } from '@/lib/router';
import { useCustomer } from './CustomerContext';
import axios from 'axios';
import toast from 'react-hot-toast';

const CustomerCart = () => {
  const navigate = useNavigate();
  const {
    customer,
    tableNumber,
    cart,
    updateQuantity,
    updateItemNotes,
    clearCart,
    cartSubtotal,
    cartTax,
    gstRate,
    cartTotal,
    setActiveOrders
  } = useCustomer();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [tempNote, setTempNote] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleStartEditNote = (item) => {
    setEditingNoteId(item._id);
    setTempNote(item.notes || '');
  };

  const handleSaveNote = (itemId) => {
    updateItemNotes(itemId, tempNote);
    setEditingNoteId(null);
  };

  const handleSendToKitchen = async () => {
    if (cart.length === 0) return;

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const orderPayload = {
        // Table, customer and prices are taken from the session and the menu on the server
        items: cart.map(item => ({
          menuItemId: item.menuItemId || item._id,
          name: item.name,
          quantity: item.quantity,
          notes: item.notes || '' // Specific dish note passed directly to kitchen
        }))
      };

      const res = await axios.post('/api/orders', orderPayload);
      const newOrder = res.data;

      // Update active orders in context
      if (newOrder) {
        if (typeof setActiveOrders === 'function') {
          setActiveOrders(prev => [newOrder, ...(Array.isArray(prev) ? prev : []).filter(o => o._id !== newOrder._id)]);
        }
      }

      // Clear the current cart
      clearCart();

      // Navigate to Order Status screen with confirmation
      navigate('/customer/order-status', {
        state: {
          justPlaced: true,
          order: newOrder
        }
      });
    } catch (err) {
      console.error('Failed to send order to kitchen:', err);
      const msg = err.response?.data?.message || 'Failed to place order. Please check network and try again.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="customer-page-content" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🛒</div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>
          Your Cart is Empty
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.92rem', marginBottom: 24, lineHeight: 1.5 }}>
          Looks like you haven't added any delicious dishes yet. Explore our fresh menu and satisfy your cravings!
        </p>
        <button
          className="btn-customer-primary"
          onClick={() => navigate('/customer/menu')}
          style={{ width: 'auto', padding: '12px 28px' }}
        >
          Explore Menu 🍴
        </button>
      </div>
    );
  }

  return (
    <div className="customer-page-content">
      {/* Table Header Banner */}
      <div style={{
        background: '#ffffff',
        borderRadius: 14,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        border: '1px solid #f1f5f9'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: 'var(--light-green)',
            color: 'var(--primary-green)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            fontWeight: 800
          }}>
            T{tableNumber}
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.92rem' }}>
              Dine-In Table {tableNumber}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Ordering for {customer?.name || 'Guest'}
            </div>
          </div>
        </div>

        <button
          onClick={() => navigate('/customer/menu')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--primary-green)',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          + Add More
        </button>
      </div>

      {errorMsg && (
        <div style={{
          background: '#fee2e2',
          border: '1px solid #fecaca',
          color: '#991b1b',
          padding: '10px 14px',
          borderRadius: 10,
          fontSize: '0.85rem',
          marginBottom: 16
        }}>
          {errorMsg}
        </div>
      )}

      {/* Cart Items List */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12
        }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>
            Selected Items ({cart.length})
          </h3>
          <button
            onClick={clearCart}
            style={{
              background: 'none',
              border: 'none',
              color: '#ef4444',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Clear All
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {cart.map(item => {
            const isEditingThisNote = editingNoteId === item._id;

            return (
              <div
                key={item._id}
                style={{
                  background: '#ffffff',
                  borderRadius: 16,
                  padding: 14,
                  boxShadow: 'var(--shadow-sm)',
                  border: '1px solid #f1f5f9'
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      color: '#1e293b',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {item.name}
                    </div>

                    <div style={{
                      fontWeight: 800,
                      color: 'var(--primary-green)',
                      fontSize: '0.92rem',
                      marginTop: 2
                    }}>
                      ₹{item.price * item.quantity}
                      <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#94a3b8', marginLeft: 4 }}>
                        (₹{item.price} each)
                      </span>
                    </div>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="stepper" style={{ transform: 'scale(0.95)' }}>
                    <button
                      className="stepper-btn"
                      onClick={() => updateQuantity(item._id, item.quantity - 1)}
                    >
                      -
                    </button>
                    <span className="stepper-val">{item.quantity}</span>
                    <button
                      className="stepper-btn"
                      onClick={() => updateQuantity(item._id, item.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* PARTICULAR DISH NOTE (Requirement: WE SHOULD ALSO ADD NOTE IN THE PARTICULAR DISH INSTEAD OF AT LST) */}
                <div style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: '1px dashed #e2e8f0'
                }}>
                  {isEditingThisNote ? (
                    <div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="e.g. Less spicy, no onion, extra crispy"
                          value={tempNote}
                          onChange={(e) => setTempNote(e.target.value)}
                          style={{ height: 36, fontSize: '0.82rem', padding: '6px 10px' }}
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveNote(item._id)}
                          style={{
                            background: 'var(--primary-green)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 8,
                            padding: '8px 12px',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            cursor: 'pointer'
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingNoteId(null)}
                          style={{
                            background: '#f1f5f9',
                            color: '#64748b',
                            border: 'none',
                            borderRadius: 8,
                            padding: '8px 10px',
                            fontWeight: 600,
                            fontSize: '0.78rem',
                            cursor: 'pointer'
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : item.notes ? (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#f8fafc',
                      padding: '6px 10px',
                      borderRadius: 8
                    }}>
                      <div style={{
                        fontSize: '0.78rem',
                        color: '#047857',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <span>📝</span>
                        <span>"{item.notes}"</span>
                      </div>
                      <button
                        onClick={() => handleStartEditNote(item)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#64748b',
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                      >
                        Edit Note
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleStartEditNote(item)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary-green)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      <span>+</span>
                      <span>Add note for this dish (e.g. less spicy, no onion)</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bill Breakdown Summary */}
      <div style={{
        background: '#ffffff',
        borderRadius: 18,
        padding: 18,
        boxShadow: 'var(--shadow-sm)',
        marginBottom: 24,
        border: '1px solid #f1f5f9'
      }}>
        <h4 style={{ fontWeight: 800, color: '#1e293b', marginBottom: 14, fontSize: '0.98rem' }}>
          Bill Summary
        </h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.88rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
            <span>Item Subtotal</span>
            <span style={{ fontWeight: 600, color: '#1e293b' }}>₹{cartSubtotal}</span>
          </div>

          {gstRate > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
              <span>GST ({gstRate}%)</span>
              <span style={{ fontWeight: 600, color: '#1e293b' }}>₹{cartTax}</span>
            </div>
          )}

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: 12,
            marginTop: 4,
            borderTop: '1px solid #f1f5f9',
            fontSize: '1.05rem',
            fontWeight: 800
          }}>
            <span style={{ color: '#1e293b' }}>To Pay (After Dining)</span>
            <span style={{ color: 'var(--primary-green)' }}>₹{cartTotal}</span>
          </div>
        </div>

        <div style={{
          marginTop: 14,
          padding: '10px 12px',
          background: 'var(--light-green)',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.78rem',
          color: 'var(--dark-green)',
          fontWeight: 600
        }}>
          <span>💡</span>
          <span>You only pay after dining! Rewards can also be applied during checkout.</span>
        </div>
      </div>

      {/* Action Button: Send Order to Kitchen */}
      <button
        className="btn-customer-primary"
        onClick={handleSendToKitchen}
        disabled={isSubmitting}
        style={{
          boxShadow: '0 8px 20px rgba(45,97,68,0.35)',
          padding: '15px'
        }}
      >
        {isSubmitting ? 'Sending to Kitchen...' : `Send Order to Kitchen (₹${cartTotal}) →`}
      </button>

      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <button
          onClick={() => navigate('/customer/menu')}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          ← Continue Browsing Menu
        </button>
      </div>
    </div>
  );
};

export default CustomerCart;

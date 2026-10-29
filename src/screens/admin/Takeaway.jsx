'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useNavigate } from '@/lib/router';
import { useAuth } from '../../context/AuthContext';
import { useMenuCategories } from '../../components/shared/useMenuCategories';

export default function Takeaway() {
  const { restaurant } = useAuth();
  const navigate = useNavigate();

  const [menuItems, setMenuItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  // Categories from Admin → Menu, in menu order
  const { categoryTabs, categoryColor, sortByMenu } = useMenuCategories(menuItems);
  const [dietFilter, setDietFilter] = useState('ALL'); // 'ALL' | 'VEG' | 'NON_VEG'
  const [search, setSearch] = useState('');

  // Customer & order fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [cart, setCart] = useState([]);

  // Item note modal
  const [noteModalItem, setNoteModalItem] = useState(null);
  const [itemNoteText, setItemNoteText] = useState('');

  // Status states
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastPlacedOrder, setLastPlacedOrder] = useState(null);

  useEffect(() => {
    loadMenu();
  }, []);

  const loadMenu = async () => {
    try {
      const res = await axios.get('/api/menu?available=true');
      setMenuItems(res.data);
    } catch (err) {
      toast.error('Failed to load menu items');
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = menuItems.filter(item => {
    const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const isVeg = item.isVeg !== false;
    const matchesDiet = dietFilter === 'ALL' || (dietFilter === 'VEG' && isVeg) || (dietFilter === 'NON_VEG' && !isVeg);
    return matchesCategory && matchesSearch && matchesDiet;
  }).sort(sortByMenu);

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(c => c.menuItemId === item._id || c.name === item.name);
      if (existing) {
        return prev.map(c => c.name === item.name ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, {
        menuItemId: item._id,
        name: item.name,
        price: item.price,
        isVeg: item.isVeg !== false,
        quantity: 1,
        notes: ''
      }];
    });
  };

  const updateQty = (name, delta) => {
    setCart(prev => {
      return prev
        .map(c => (c.name === name ? { ...c, quantity: c.quantity + delta } : c))
        .filter(c => c.quantity > 0);
    });
  };

  const openItemNote = (item) => {
    setNoteModalItem(item);
    setItemNoteText(item.notes || '');
  };

  const saveItemNote = () => {
    if (!noteModalItem) return;
    setCart(prev => prev.map(c => c.name === noteModalItem.name ? { ...c, notes: itemNoteText } : c));
    setNoteModalItem(null);
    setItemNoteText('');
  };

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const gstRate = restaurant?.gstRate ?? 5;
  const gstAmount = Math.round(subtotal * gstRate / 100);
  const totalAmount = subtotal + gstAmount;

  const handleSubmit = async () => {
    if (cart.length === 0) {
      toast.error('Please add at least one item to the parcel cart');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        orderType: 'takeaway',
        customerName: customerName.trim() || 'Parcel Customer',
        customerPhone: customerPhone.trim(),
        notes: orderNotes.trim(),
        items: cart.map(i => ({
          menuItemId: i.menuItemId,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          notes: i.notes || ''
        })),
        customerCount: 1
      };

      const res = await axios.post('/api/orders', payload);
      toast.success(`🎉 Parcel Order #${res.data.orderNumber} placed & sent to kitchen!`);
      setLastPlacedOrder(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error placing takeaway order');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setOrderNotes('');
    setLastPlacedOrder(null);
  };


  if (loading) {
    return <div className="loading-center"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <div className="page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🛍️</span> Takeaway / Parcel Ordering
          </h1>
          <p className="text-muted text-sm" style={{ marginTop: 2 }}>
            Instant parcel counter: Select items, add customer notes, and dispatch straight to kitchen
          </p>
        </div>
        <div className="flex-gap">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/orders')}>
            📋 View Orders
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/billing')}>
            💳 Go to Billing
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Customer & Token Bar */}
        <div className="card mb-16" style={{ background: '#fffaf0', border: '1.5px solid #FEEBC8', padding: '16px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, alignItems: 'center' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#7B341E', display: 'block', marginBottom: 4 }}>
                👤 Customer Name
              </label>
              <input
                type="text"
                placeholder="e.g. Rahul, John Doe"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #CBD5E0', background: 'white', fontSize: 13 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#7B341E', display: 'block', marginBottom: 4 }}>
                📞 Phone Number (Optional)
              </label>
              <input
                type="tel"
                placeholder="e.g. 9876543210"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #CBD5E0', background: 'white', fontSize: 13 }}
              />
            </div>
            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#7B341E', display: 'block', marginBottom: 4 }}>
                📝 Parcel Note / Instructions
              </label>
              <input
                type="text"
                placeholder="e.g. Pack extra chutney, cutlery required"
                value={orderNotes}
                onChange={e => setOrderNotes(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #CBD5E0', background: 'white', fontSize: 13 }}
              />
            </div>
          </div>
        </div>

        {/* Main Grid: Menu on Left, Cart on Right */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 390px', gap: 20, alignItems: 'start' }}>
          {/* Menu Column */}
          <div>
            {/* Search and Filters */}
            <div className="card mb-16" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="🔍 Search parcel menu items..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1.5px solid #E2E8F0', fontSize: 14 }}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#718096' }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Diet Buttons */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className={`btn btn-sm ${dietFilter === 'ALL' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setDietFilter('ALL')}
                  >
                    All
                  </button>
                  <button
                    className={`btn btn-sm ${dietFilter === 'VEG' ? 'btn-success' : 'btn-ghost'}`}
                    onClick={() => setDietFilter('VEG')}
                  >
                    🟢 Veg
                  </button>
                  <button
                    className={`btn btn-sm ${dietFilter === 'NON_VEG' ? 'btn-danger' : 'btn-ghost'}`}
                    onClick={() => setDietFilter('NON_VEG')}
                  >
                    🔴 Non-Veg
                  </button>
                </div>
              </div>

              {/* Categories */}
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {categoryTabs.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      border: activeCategory === cat ? 'none' : '1px solid #E2E8F0',
                      background: activeCategory === cat ? categoryColor(cat) : 'white',
                      color: activeCategory === cat ? 'white' : '#4A5568',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Menu Items Grid */}
            {filteredItems.length === 0 ? (
              <div className="card text-center" style={{ padding: 40, color: '#718096' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🍽️</div>
                <p>No menu items found matching "{search}"</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
                {filteredItems.map(item => {
                  const cartItem = cart.find(c => c.name === item.name);
                  const isVeg = item.isVeg !== false;
                  return (
                    <div
                      key={item._id}
                      style={{
                        background: 'white',
                        border: cartItem ? '2px solid #FF6B35' : '1px solid #E2E8F0',
                        borderRadius: 10,
                        padding: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: cartItem ? '0 4px 12px rgba(255,107,53,0.15)' : '0 1px 3px rgba(0,0,0,0.05)',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 16, height: 16,
                            border: `1.5px solid ${isVeg ? '#38a169' : '#e53e3e'}`,
                            borderRadius: 3, padding: 2
                          }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: isVeg ? '#38a169' : '#e53e3e' }}></span>
                          </span>
                          <span style={{ fontSize: 11, color: '#718096', background: '#F7FAFC', padding: '2px 6px', borderRadius: 4 }}>
                            {item.category}
                          </span>
                        </div>

                        <div style={{ fontWeight: 700, fontSize: 14, color: '#2D3748', marginBottom: 4 }}>
                          {item.name}
                        </div>
                        {item.description && (
                          <div style={{ fontSize: 11, color: '#718096', marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {item.description}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px solid #F0F4F8' }}>
                        <span style={{ fontWeight: 800, fontSize: 15, color: '#FF6B35' }}>
                          ₹{item.price}
                        </span>

                        {cartItem ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FFF5F0', borderRadius: 6, padding: '2px 4px', border: '1px solid #FFD8CC' }}>
                            <button
                              onClick={() => updateQty(item.name, -1)}
                              style={{ width: 26, height: 26, borderRadius: 4, border: 'none', background: 'white', color: '#FF6B35', fontWeight: 800, cursor: 'pointer' }}
                            >
                              -
                            </button>
                            <span style={{ fontWeight: 800, fontSize: 13, minWidth: 18, textAlign: 'center' }}>
                              {cartItem.quantity}
                            </span>
                            <button
                              onClick={() => updateQty(item.name, 1)}
                              style={{ width: 26, height: 26, borderRadius: 4, border: 'none', background: '#FF6B35', color: 'white', fontWeight: 800, cursor: 'pointer' }}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => addToCart(item)}
                            className="btn btn-sm btn-primary"
                            style={{ padding: '5px 12px', fontSize: 12, borderRadius: 6 }}
                          >
                            + Add
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cart Column (Sticky) */}
          <div style={{ position: 'sticky', top: 20 }}>
            <div className="card" style={{ padding: 18, border: '1.5px solid #E2E8F0', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
              <div className="flex-between mb-16" style={{ paddingBottom: 12, borderBottom: '1.5px solid #EDF2F7' }}>
                <div>
                  <h3 style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    🛍️ Parcel Cart
                  </h3>
                  <span className="text-muted text-sm">{cart.length} item{cart.length !== 1 ? 's' : ''} in package</span>
                </div>
                {cart.length > 0 && (
                  <button
                    onClick={() => setCart([])}
                    style={{ background: 'none', border: 'none', color: '#E53E3E', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Clear All
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 10px', color: '#A0AEC0' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
                  <div style={{ fontWeight: 600, color: '#4A5568' }}>Parcel cart is empty</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Select items from the menu to start packing</div>
                </div>
              ) : (
                <>
                  <div style={{ maxHeight: '340px', overflowY: 'auto', paddingRight: 4, marginBottom: 16 }}>
                    {cart.map(item => (
                      <div
                        key={item.name}
                        style={{
                          padding: '10px 0',
                          borderBottom: '1px solid #EDF2F7',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ flex: 1, paddingRight: 8 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#2D3748' }}>
                              {item.name}
                            </div>
                            <div style={{ fontSize: 11, color: '#718096' }}>
                              ₹{item.price} each
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                              onClick={() => updateQty(item.name, -1)}
                              style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid #CBD5E0', background: 'white', cursor: 'pointer', fontWeight: 700 }}
                            >
                              -
                            </button>
                            <span style={{ fontWeight: 700, fontSize: 13, minWidth: 20, textAlign: 'center' }}>
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQty(item.name, 1)}
                              style={{ width: 24, height: 24, borderRadius: 4, border: 'none', background: '#FF6B35', color: 'white', cursor: 'pointer', fontWeight: 700 }}
                            >
                              +
                            </button>
                          </div>

                          <div style={{ minWidth: 60, textAlign: 'right', fontWeight: 700, fontSize: 13 }}>
                            ₹{item.price * item.quantity}
                          </div>
                        </div>

                        {/* Special item note */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            onClick={() => openItemNote(item)}
                            style={{
                              border: 'none',
                              background: 'none',
                              fontSize: 11,
                              color: item.notes ? '#FF6B35' : '#718096',
                              fontWeight: 600,
                              cursor: 'pointer',
                              padding: 0
                            }}
                          >
                            📝 {item.notes ? `Note: "${item.notes}"` : '+ Add item note'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pricing Breakdown */}
                  <div style={{ background: '#F7FAFC', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                    <div className="flex-between text-sm" style={{ marginBottom: 4 }}>
                      <span className="text-muted">Subtotal</span>
                      <strong>₹{subtotal}</strong>
                    </div>
                    {gstRate > 0 && (
                      <div className="flex-between text-sm" style={{ marginBottom: 4 }}>
                        <span className="text-muted">GST ({gstRate}%)</span>
                        <span>₹{gstAmount}</span>
                      </div>
                    )}
                    <div style={{ borderTop: '1px dashed #CBD5E0', margin: '8px 0' }}></div>
                    <div className="flex-between" style={{ fontWeight: 800, fontSize: 16 }}>
                      <span>Total Amount</span>
                      <span style={{ color: '#FF6B35' }}>₹{totalAmount}</span>
                    </div>
                  </div>

                  {/* Send to Kitchen Button */}
                  <button
                    className="btn btn-primary w-full btn-lg"
                    onClick={handleSubmit}
                    disabled={submitting || cart.length === 0}
                    style={{
                      background: '#FF6B35',
                      fontSize: '1rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8
                    }}
                  >
                    {submitting ? 'Sending to Kitchen...' : '🚀 Send Parcel to Kitchen'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Item Note Modal */}
      {noteModalItem && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <h3 style={{ marginBottom: 12 }}>Note for {noteModalItem.name}</h3>
            <textarea
              rows={3}
              value={itemNoteText}
              onChange={e => setItemNoteText(e.target.value)}
              placeholder="e.g. Extra spicy, no onions, pack gravy separately"
              style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #CBD5E0', fontSize: 13, marginBottom: 14 }}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setNoteModalItem(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveItemNote}>Save Note</button>
            </div>
          </div>
        </div>
      )}

      {/* Order Placed Success Modal */}
      {lastPlacedOrder && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460, textAlign: 'center', padding: 28 }}>
            <div style={{ fontSize: 50, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontFamily: 'Inter', fontWeight: 800, color: '#276749', marginBottom: 6 }}>
              Takeaway Order Placed!
            </h2>
            <p className="text-muted text-sm" style={{ marginBottom: 20 }}>
              The parcel order has been created and dispatched to the kitchen display.
            </p>

            <div style={{ background: '#F7FAFC', border: '1.5px solid #E2E8F0', borderRadius: 10, padding: 16, marginBottom: 20, textAlign: 'left' }}>
              <div className="flex-between" style={{ marginBottom: 8 }}>
                <span className="text-muted text-sm">Order Number</span>
                <strong style={{ fontSize: 16 }}>#{lastPlacedOrder.orderNumber}</strong>
              </div>
              <div className="flex-between" style={{ marginBottom: 8 }}>
                <span className="text-muted text-sm">Takeaway Token</span>
                <span className="badge badge-purple" style={{ fontSize: 13, fontWeight: 700 }}>
                  {lastPlacedOrder.takeawayToken || `TK-${lastPlacedOrder.orderNumber}`}
                </span>
              </div>
              <div className="flex-between" style={{ marginBottom: 8 }}>
                <span className="text-muted text-sm">Customer</span>
                <strong>{lastPlacedOrder.customerName || 'Parcel Customer'}</strong>
              </div>
              <div className="flex-between">
                <span className="text-muted text-sm">Total Amount</span>
                <strong style={{ color: '#FF6B35', fontSize: 15 }}>₹{lastPlacedOrder.totalAmount}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn btn-success btn-lg w-full"
                onClick={() => navigate('/admin/billing')}
                style={{ fontWeight: 700 }}
              >
                💳 Collect Payment & Generate Bill Now
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => navigate('/admin/orders')}
                  style={{ flex: 1 }}
                >
                  📋 View in Orders
                </button>
                <button
                  className="btn btn-primary"
                  onClick={resetForm}
                  style={{ flex: 1 }}
                >
                  ➕ New Parcel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

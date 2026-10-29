'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { VegBadge } from '../admin/Menu';
import { useAuth } from '../../context/AuthContext';

const CATEGORIES = ['All', 'Starters', 'Main Course', 'Drinks', 'Desserts', 'Fast Food', 'Special Items'];

export default function OrderModal({ table, onClose, onSuccess }) {
  const { restaurant } = useAuth();
  const gstRate = restaurant?.gstRate ?? 5;
  const [menuItems, setMenuItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [dietFilter, setDietFilter] = useState('ALL'); // 'ALL' | 'VEG' | 'NON_VEG'
  const [search, setSearch] = useState('');
  const [noteModal, setNoteModal] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [existingOrder, setExistingOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  useEffect(() => {
    axios.get('/api/menu?available=true').then(r => setMenuItems(r.data));
    // Load existing order if table is occupied
    if (table.status === 'occupied') {
      axios.get(`/api/orders?active=true`).then(r => {
        const found = r.data.find(o => o.tableNumber === table.tableNumber);
        if (found) {
          setExistingOrder(found);
          // An order can list a dish in several batches; edit it as one line with the total quantity
          const merged = [];
          found.items.forEach(i => {
            const line = merged.find(m => m.name === i.name);
            if (line) line.quantity += i.quantity;
            else merged.push({ menuItemId: i.menuItemId, name: i.name, price: i.price, quantity: i.quantity, notes: i.notes || '' });
          });
          setCart(merged);
        }
      });
    }
  }, [table]);

  const filtered = menuItems.filter(i => {
    const matchesCat = activeCategory === 'All' || i.category === activeCategory;
    const matchesSearch = i.name.toLowerCase().includes(search.toLowerCase());
    const isVeg = i.isVeg !== false;
    const matchesDiet = dietFilter === 'ALL' || (dietFilter === 'VEG' && isVeg) || (dietFilter === 'NON_VEG' && !isVeg);
    return matchesCat && matchesSearch && matchesDiet;
  });

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(c => c.menuItemId === item._id || c.name === item.name);
      if (existing) {
        return prev.map(c => (c.name === item.name ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [...prev, { menuItemId: item._id, name: item.name, price: item.price, quantity: 1, notes: '' }];
    });
  };

  const updateQty = (name, delta) => {
    setCart(prev => {
      const updated = prev.map(c => c.name === name ? { ...c, quantity: c.quantity + delta } : c);
      return updated.filter(c => c.quantity > 0);
    });
  };

  const openNote = (item) => {
    setNoteModal(item.name);
    setNoteText(item.notes || '');
  };

  const saveNote = () => {
    setCart(prev => prev.map(c => c.name === noteModal ? { ...c, notes: noteText } : c));
    setNoteModal(null);
  };

  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  const handleSubmit = async () => {
    if (cart.length === 0) { toast.error('Add at least one item'); return; }
    setLoading(true);
    try {
      if (existingOrder) {
        await axios.put(`/api/orders/${existingOrder._id}`, { items: cart });
        toast.success('Order updated & sent to kitchen!');
      } else {
        await axios.post('/api/orders', {
          tableId: table._id,
          tableNumber: table.tableNumber,
          items: cart,
          customerCount: table.customerCount || 1,
        });
        toast.success('Order placed & sent to kitchen!');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error placing order');
    } finally {
      setLoading(false);
    }
  };

  const catColors = {
    'Starters': '#FF6B35', 'Main Course': '#3182ce', 'Drinks': '#38a169',
    'Desserts': '#805ad5', 'Fast Food': '#e53e3e', 'Special Items': '#ED8936'
  };

  return (
    <div className="modal-overlay" style={{ alignItems: 'stretch', padding: 0 }}>
      <div className="order-modal-flex" style={{ display: 'flex', width: '100%', height: '100vh', background: 'white', position: 'relative' }}>
        {/* Left: Menu */}
        <div className="order-modal-menu" style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', background: 'white' }}>
            <div className="flex-between">
              <h2 style={{ fontFamily: 'Inter', fontSize: '1.1rem', fontWeight: 700 }}>
                🍽️ Menu — Table T{table.tableNumber}
                {table.customerCount && <span className="text-muted text-sm" style={{ marginLeft: 8 }}>({table.customerCount} guests)</span>}
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
            </div>
            <div style={{ marginTop: 12 }}>
              <input className="form-input" placeholder="Search menu..." value={search}
                onChange={e => setSearch(e.target.value)} style={{ marginBottom: 10 }} />
              
              {/* Diet filter pills */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => setDietFilter(dietFilter === 'VEG' ? 'ALL' : 'VEG')}
                  className="btn btn-sm"
                  style={{
                    fontSize: 11,
                    padding: '3px 9px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    border: dietFilter === 'VEG' ? '2px solid #10B981' : '1px solid #CBD5E1',
                    background: dietFilter === 'VEG' ? '#ECFDF5' : 'white',
                    color: dietFilter === 'VEG' ? '#065F46' : '#475569',
                    fontWeight: dietFilter === 'VEG' ? 700 : 500
                  }}
                >
                  <VegBadge isVeg={true} size={13} /> Veg
                </button>
                <button
                  type="button"
                  onClick={() => setDietFilter(dietFilter === 'NON_VEG' ? 'ALL' : 'NON_VEG')}
                  className="btn btn-sm"
                  style={{
                    fontSize: 11,
                    padding: '3px 9px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    border: dietFilter === 'NON_VEG' ? '2px solid #EF4444' : '1px solid #CBD5E1',
                    background: dietFilter === 'NON_VEG' ? '#FEF2F2' : 'white',
                    color: dietFilter === 'NON_VEG' ? '#991B1B' : '#475569',
                    fontWeight: dietFilter === 'NON_VEG' ? 700 : 500
                  }}
                >
                  <VegBadge isVeg={false} size={13} /> Non-Veg
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)}
                    className={`btn btn-sm ${activeCategory === cat ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{cat}</button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {filtered.map(item => {
                const inCart = cart.find(c => c.name === item.name);
                return (
                  <div key={item._id} style={{
                    border: `2px solid ${inCart ? '#FF6B35' : '#E2E8F0'}`,
                    borderRadius: 10, padding: 14, background: inCart ? '#fff3ee' : 'white',
                    transition: 'all 0.2s', cursor: 'pointer'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: catColors[item.category] || '#718096', letterSpacing: '0.05em' }}>{item.category}</div>
                      <strong style={{ color: '#FF6B35', fontSize: 14 }}>₹{item.price}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <VegBadge isVeg={item.isVeg !== false} size={13} />
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{item.name}</div>
                    </div>
                    <div style={{ fontSize: 11, color: '#718096', marginBottom: 10 }}>{item.description}</div>
                    {inCart ? (
                      <div className="qty-control" style={{ justifyContent: 'center' }}>
                        <button className="qty-btn" onClick={() => updateQty(item.name, -1)}>−</button>
                        <span className="qty-num">{inCart.quantity}</span>
                        <button className="qty-btn" onClick={() => updateQty(item.name, 1)}>+</button>
                      </div>
                    ) : (
                      <button className="btn btn-primary w-full" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => addToCart(item)}>
                        + Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {filtered.length === 0 && <div className="empty-state"><p>No items found</p></div>}
          </div>
        </div>

        {/* Floating mobile cart bar — shown only on small screens via CSS */}
        {cart.length > 0 && (
          <button className="mobile-cart-bar" onClick={() => setMobileCartOpen(true)}>
            <span>🛒 {cart.length} item{cart.length > 1 ? 's' : ''}</span>
            <span>View Cart · ₹{cartTotal + Math.round(cartTotal * 0.05)} ▲</span>
          </button>
        )}

        {/* Backdrop for mobile cart sheet */}
        {mobileCartOpen && <div className="sidebar-backdrop mobile-cart-backdrop" onClick={() => setMobileCartOpen(false)} />}

        {/* Right: Cart */}
        <div className={`order-modal-cart ${mobileCartOpen ? 'open' : ''}`} style={{ width: 340, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
            <div className="flex-between">
              <h3 style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '1rem' }}>
                🛒 Order Cart <span className="text-muted text-sm">({cart.length} items)</span>
              </h3>
              <button className="btn btn-ghost btn-sm mobile-cart-close" onClick={() => setMobileCartOpen(false)}>✕</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {cart.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <div className="icon">🛒</div>
                <p className="text-sm">No items added yet.<br />Select from menu.</p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.name} className="cart-item" style={{ padding: '10px 0' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: '#718096' }}>₹{item.price} each</div>
                    {item.notes && (
                      <div style={{ fontSize: 11, color: '#FF6B35', fontStyle: 'italic', marginTop: 2 }}>
                        📝 {item.notes}
                      </div>
                    )}
                    <button onClick={() => openNote(item)} style={{ fontSize: 11, color: '#3182ce', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', marginTop: 2 }}>
                      {item.notes ? '✏️ Edit note' : '+ Add note'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <div className="qty-control">
                      <button className="qty-btn" style={{ width: 24, height: 24 }} onClick={() => updateQty(item.name, -1)}>−</button>
                      <span className="qty-num" style={{ fontSize: 13 }}>{item.quantity}</span>
                      <button className="qty-btn" style={{ width: 24, height: 24 }} onClick={() => updateQty(item.name, 1)}>+</button>
                    </div>
                    <strong style={{ fontSize: 13, color: '#FF6B35' }}>₹{item.price * item.quantity}</strong>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ padding: 16, borderTop: '1px solid #E2E8F0' }}>
            <div className="flex-between" style={{ marginBottom: 8, fontSize: 13 }}>
              <span className="text-muted">Subtotal</span><span>₹{cartTotal}</span>
            </div>
            {gstRate > 0 && (
              <div className="flex-between" style={{ marginBottom: 12, fontSize: 13 }}>
                <span className="text-muted">GST ({gstRate}%)</span><span>₹{Math.round(cartTotal * gstRate / 100)}</span>
              </div>
            )}
            <div className="flex-between font-bold" style={{ fontSize: '1rem', marginBottom: 16 }}>
              <span>Total</span><span style={{ color: '#FF6B35' }}>₹{cartTotal + Math.round(cartTotal * gstRate / 100)}</span>
            </div>
            <button className="btn btn-primary w-full btn-lg" onClick={handleSubmit} disabled={loading || cart.length === 0}>
              {loading ? 'Sending...' : existingOrder ? '🔄 Update Order' : '✅ Send to Kitchen'}
            </button>
          </div>
        </div>
      </div>

      {/* Note modal */}
      {noteModal && (
        <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={() => setNoteModal(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📝 Special Instructions</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setNoteModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-muted" style={{ marginBottom: 12 }}>For: <strong>{noteModal}</strong></p>
              <textarea className="form-textarea" placeholder="e.g. Extra spicy, No onion, Less oil, Jain preparation..."
                value={noteText} onChange={e => setNoteText(e.target.value)} style={{ height: 100 }} autoFocus />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {['Extra spicy', 'Less spicy', 'No onion', 'Less oil', 'Less salt', 'Jain preparation', 'Pack separately', 'Well done'].map(s => (
                  <button key={s} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                    onClick={() => setNoteText(p => p ? p + ', ' + s : s)}>{s}</button>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setNoteText(''); setNoteModal(null); }}>Clear</button>
              <button className="btn btn-primary" onClick={saveNote}>Save Note</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
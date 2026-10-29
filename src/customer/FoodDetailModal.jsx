'use client';

import React, { useState } from 'react';
import { useCustomer } from './CustomerContext';

export default function FoodDetailModal({ item, onClose }) {
  const { addToCart, isCounter } = useCustomer();
  const [quantity, setQuantity] = useState(1);
  const [dishNote, setDishNote] = useState('');

  if (!item) return null;

  const isVeg = item.isVeg !== false;

  const quickNotes = [
    '🌶️ Less Spicy',
    '🧅 No Onion',
    '🧄 No Garlic',
    '🧀 Extra Cheese',
    '🔥 Extra Spicy',
    '🧊 Less Ice'
  ];

  const handleAdd = () => {
    addToCart(item, quantity, dishNote);
    onClose();
  };

  const handleQuickNoteClick = (note) => {
    if (dishNote.includes(note)) {
      setDishNote(prev => prev.replace(note, '').trim());
    } else {
      setDishNote(prev => (prev ? `${prev}, ${note}` : note));
    }
  };

  return (
    <div className="cust-modal-backdrop" onClick={onClose}>
      <div className="cust-modal-sheet" onClick={e => e.stopPropagation()}>
        {/* Close handle button */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 40, height: 4, background: '#CBD5E0', borderRadius: 2 }} />
        </div>

        {/* Category and close button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{
            background: '#EEF6F1',
            padding: '4px 12px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
            color: '#2D6144'
          }}>
            {item.category || 'Special Item'}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: '#F1F5F9',
              color: '#334155',
              border: 'none',
              fontSize: 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {/* Title, Veg indicator & Price */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18, height: 18,
                border: `2px solid ${isVeg ? '#2D6144' : '#E53E3E'}`,
                borderRadius: 4, padding: 2
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: isVeg ? '#2D6144' : '#E53E3E' }} />
              </span>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2E22' }}>
                {item.name}
              </h2>
            </div>
          </div>
          <div style={{ fontWeight: 800, fontSize: '1.35rem', color: '#2D6144' }}>
            ₹{item.price}
          </div>
        </div>

        {/* Description */}
        <p style={{ fontSize: 13, color: '#5A6E62', lineHeight: 1.5, marginBottom: 18 }}>
          {item.description || 'Deliciously prepared with authentic ingredients and freshly served hot to your table.'}
        </p>

        {isCounter ? (
          <div style={{ background: '#FFF8E6', border: '1px solid #F6D78B', color: '#92400E', borderRadius: 12, padding: '10px 12px', fontSize: '0.85rem', fontWeight: 700, textAlign: 'center' }}>
            🧑‍🍳 Please give your order to our captain.
          </div>
        ) : (
        <>
        {/* Particular Dish Note (Crucial Requirement) */}
        <div style={{
          background: '#F5F9F6',
          border: '1.5px solid #CBE2D3',
          borderRadius: 14,
          padding: '14px',
          marginBottom: 18
        }}>
          <label style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 800,
            color: '#24503A',
            marginBottom: 6
          }}>
            📝 Special Instructions for this Dish
          </label>
          <input
            type="text"
            className="cust-dish-note-input"
            placeholder="e.g. Less spicy, no onion, extra cheese"
            value={dishNote}
            onChange={e => setDishNote(e.target.value)}
          />

          {/* Quick chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {quickNotes.map(qn => (
              <button
                key={qn}
                type="button"
                onClick={() => handleQuickNoteClick(qn)}
                style={{
                  background: dishNote.includes(qn) ? '#2D6144' : 'white',
                  color: dishNote.includes(qn) ? 'white' : '#2D3748',
                  border: '1px solid #CBD5E0',
                  borderRadius: 16,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {qn}
              </button>
            ))}
          </div>
        </div>

        {/* Quantity Stepper & Add to Cart button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Stepper */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#F1F5F3',
            borderRadius: 12,
            padding: '6px 10px',
            border: '1px solid #DCE8E0'
          }}>
            <button
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: 'none',
                background: 'white',
                fontSize: 16,
                fontWeight: 800,
                color: '#2D6144',
                cursor: 'pointer'
              }}
            >
              -
            </button>
            <span style={{ fontWeight: 800, fontSize: 16, minWidth: 20, textAlign: 'center' }}>
              {quantity}
            </span>
            <button
              onClick={() => setQuantity(q => q + 1)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: 'none',
                background: '#2D6144',
                fontSize: 16,
                fontWeight: 800,
                color: 'white',
                cursor: 'pointer'
              }}
            >
              +
            </button>
          </div>

          {/* Add to Cart button */}
          <button
            onClick={handleAdd}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: 14,
              border: 'none',
              background: 'linear-gradient(135deg, #2D6144 0%, #24503A 100%)',
              color: 'white',
              fontWeight: 800,
              fontSize: '1rem',
              cursor: 'pointer',
              boxShadow: '0 6px 18px rgba(45, 97, 68, 0.25)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span>Add to Cart</span>
            <span>₹{item.price * quantity}</span>
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

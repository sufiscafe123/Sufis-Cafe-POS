'use client';

import React, { useState, useEffect } from 'react';
import { useCustomer } from './CustomerContext';
import FoodDetailModal from './FoodDetailModal';
import axios from 'axios';
import { Minus, Plus, Search, X } from 'lucide-react';
import CoffeeBean from './CoffeeBean';

const DEFAULT_CATEGORIES = [
  { id: 'all', label: 'All Items', icon: '🍽️' },
  { id: 'Starters', label: 'Starters', icon: '🥟' },
  { id: 'Main Course', label: 'Main Course', icon: '🍲' },
  { id: 'Pizza', label: 'Pizza', icon: '🍕' },
  { id: 'Burgers', label: 'Burgers', icon: '🍔' },
  { id: 'Beverages', label: 'Beverages', icon: '🥤' },
  { id: 'Desserts', label: 'Desserts', icon: '🍰' }
];

export default function CustomerMenu() {
  const { getItemQuantity, addToCart, updateQuantity, socket, isCounter, visitEnded, viewOnly } = useCustomer();
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVegOnly, setFilterVegOnly] = useState(false);
  const [activeModalItem, setActiveModalItem] = useState(null);

  const fetchMenu = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/menu');
      setMenuItems((res.data || []).filter(item => item.available !== false));
    } catch (err) {
      console.warn('Error fetching menu items:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await axios.get('/api/categories');
      if (res.data && res.data.length > 0) {
        const dynamicCats = [
          { id: 'all', label: 'All Items', icon: '🍽️' },
          ...res.data.map(c => ({
            id: c.name,
            label: c.name,
            icon: c.icon || '🍽️'
          }))
        ];
        setCategories(dynamicCats);
      }
    } catch (err) {
      console.warn('Error fetching categories:', err.message);
    }
  };

  useEffect(() => {
    fetchMenu();
    fetchCategories();
  }, []);

  // Live menu changes from the admin (price, availability, new dishes)
  useEffect(() => {
    if (!socket) return;
    const onMenu = () => fetchMenu();
    const onCategories = () => fetchCategories();
    socket.on('menu-updated', onMenu);
    socket.on('categories-updated', onCategories);
    return () => {
      socket.off('menu-updated', onMenu);
      socket.off('categories-updated', onCategories);
    };
  }, [socket]);

  // Only categories that actually have dishes on the menu (same list the admin sees)
  const visibleCategories = categories.filter(cat =>
    cat.id === 'all' || menuItems.some(item => (item.category || '').toLowerCase() === cat.id.toLowerCase())
  );

  const filteredItems = menuItems.filter(item => {
    const isVeg = item.isVegetarian ?? item.isVeg ?? true;

    const matchesCategory =
      selectedCategory === 'all' ||
      (item.category && item.category.toLowerCase() === selectedCategory.toLowerCase());

    const matchesSearch =
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesVeg = !filterVegOnly || isVeg;

    return matchesCategory && matchesSearch && matchesVeg;
  });

  return (
    <div className="customer-page-content st-page">
      {/* Search */}
      <div className="st-search">
        <Search size={18} color="#55665B" aria-hidden="true" />
        <input
          type="text"
          placeholder="Search coffee, food, desserts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="st-search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Dish count and Pure Veg filter */}
      <div className="st-toolbar">
        <span className="st-count">
          {filteredItems.length} {filteredItems.length === 1 ? 'dish' : 'dishes'} available
        </span>
        <button className={`st-veg-toggle ${filterVegOnly ? 'on' : ''}`} onClick={() => setFilterVegOnly(!filterVegOnly)}>
          <VegMark veg /> Pure Veg
        </button>
      </div>

      {isCounter && (
        <div className="st-notice">
          🧑‍🍳 Please give your order to our captain. Show your phone at the counter to collect stamps.
        </div>
      )}
      {visitEnded && (
        <div className="st-notice">
          ☕ Thank you for visiting! To order again, scan the QR code on your table.
        </div>
      )}

      {/* Categories */}
      <div className="category-scroll st-cats">
        {visibleCategories.map(cat => {
          const isActive = selectedCategory.toLowerCase() === cat.id.toLowerCase();
          return (
            <button
              key={cat.id}
              className={`st-cat ${isActive ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Dishes */}
      {loading ? (
        <div className="st-empty">
          <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
          Loading our menu...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="st-empty st-card">
          <CoffeeBean size={34} />
          <h4 className="st-empty-title">No dishes found</h4>
          <p>Try another category or turn off the Pure Veg filter.</p>
          <button
            className="st-btn-outline"
            onClick={() => { setSelectedCategory('all'); setSearchQuery(''); setFilterVegOnly(false); }}
          >
            Show All Dishes
          </button>
        </div>
      ) : (
        <div className="st-list">
          {filteredItems.map(item => {
            const isVeg = item.isVegetarian ?? item.isVeg ?? true;
            const qty = typeof getItemQuantity === 'function' ? getItemQuantity(item._id) : 0;

            return (
              <div key={item._id} className="st-card st-dish" onClick={() => setActiveModalItem(item)}>
                {/* Dish info (no photos: the menu shows exactly what the admin sets) */}
                <div className="st-dish-top">
                  <VegMark veg={isVeg} />
                  <h3 className="st-dish-name">{item.name}</h3>
                </div>
                <p className="st-dish-desc">{item.description || 'Freshly prepared at Sufi\u2019s Cafe.'}</p>

                <div className="st-dish-foot">
                  <span className="st-price">₹{item.price}</span>

                  {viewOnly ? null : qty > 0 ? (
                    <div className="st-stepper" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => updateQuantity(item._id, qty - 1)} aria-label="Remove one"><Minus size={16} aria-hidden="true" /></button>
                      <span>{qty}</span>
                      <button onClick={() => addToCart(item, 1)} aria-label="Add one"><Plus size={16} aria-hidden="true" /></button>
                    </div>
                  ) : (
                    <button
                      className="st-add"
                      onClick={(e) => {
                        e.stopPropagation();
                        addToCart(item, 1);
                      }}
                    >
                      <Plus size={15} strokeWidth={2.4} aria-hidden="true" /> Add
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for viewing details and adding note per dish */}
      <FoodDetailModal
        item={activeModalItem}
        onClose={() => setActiveModalItem(null)}
      />
    </div>
  );
}

// Standard veg / non-veg square mark
function VegMark({ veg }) {
  return (
    <span className={`st-vegmark ${veg ? 'veg' : 'nonveg'}`} title={veg ? 'Veg' : 'Non-veg'} aria-label={veg ? 'Veg' : 'Non-veg'}>
      <span />
    </span>
  );
}

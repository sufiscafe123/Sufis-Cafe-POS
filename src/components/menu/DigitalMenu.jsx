'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { createRealtimeSocket } from '@/lib/realtime-client';

// Category subtitles to match the elegant Sufi cafe aesthetic
const CATEGORY_SUBTITLES = {
  coffee: 'Made with premium arabica beans',
  'signature coffee': 'Our master roaster’s signature blends',
  'premium brews': 'Artisanal pour-over & cold extractions',
  beverages: 'Chilled sips, mocktails & iced coolers',
  tea: 'Fine artisanal whole leaf teas',
  bakery: 'Freshly baked croissants, loaves & artisan pastries',
  desserts: 'Decadent sweet creations & sweet treats',
  starters: 'Savory small plates & cafe bites',
  'main course': 'Wholesome hearty cafe specialties',
  pizza: 'Hand-tossed sourdough artisan crusts',
  burgers: 'Gourmet brioche burgers & crisp sides'
};

export default function DigitalMenu({ viewOnly = true }) {
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const sectionRefs = useRef({});

  // Fetch Menu from Backend API
  const fetchMenu = async () => {
    try {
      const res = await axios.get('/api/menu');
      // Only show available items
      const activeItems = (res.data || []).filter(item => item.available !== false);
      setMenuItems(activeItems);
    } catch (err) {
      console.warn('Error fetching digital menu items:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Categories from Backend API
  const fetchCategories = async () => {
    try {
      const res = await axios.get('/api/categories');
      if (res.data && res.data.length > 0) {
        setCategories(res.data);
      }
    } catch (err) {
      console.warn('Error fetching digital menu categories:', err.message);
    }
  };

  useEffect(() => {
    fetchMenu();
    fetchCategories();

    // Setup Realtime connection to receive live updates from Admin -> Menu
    let socket;
    try {
      socket = createRealtimeSocket();
      socket.on('menu-updated', fetchMenu);
      socket.on('categories-updated', () => {
        fetchMenu();
        fetchCategories();
      });
    } catch (e) {
      console.warn('Realtime socket not initialized:', e);
    }

    // Polling fallback every 15 seconds to ensure live sync
    const interval = setInterval(() => {
      fetchMenu();
      fetchCategories();
    }, 15000);

    // Refetch when tab becomes visible
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchMenu();
        fetchCategories();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (socket) socket.disconnect();
    };
  }, []);

  // Compute category list from admin categories and items
  const categoryList = useMemo(() => {
    const list = [];
    const used = new Set();

    // From admin categories table
    categories.forEach(cat => {
      const name = cat.name.trim();
      const lower = name.toLowerCase();
      // Only include if there are dishes for this category
      const hasItems = menuItems.some(i => (i.category || '').trim().toLowerCase() === lower);
      if (hasItems && !used.has(lower)) {
        list.push({ id: lower, name: name });
        used.add(lower);
      }
    });

    // Plus any categories on items not yet in categories list
    menuItems.forEach(item => {
      const cat = (item.category || '').trim();
      if (!cat) return;
      const lower = cat.toLowerCase();
      if (!used.has(lower)) {
        list.push({ id: lower, name: cat });
        used.add(lower);
      }
    });

    return list;
  }, [categories, menuItems]);

  // Group items by category
  const groupedItems = useMemo(() => {
    const groups = {};
    categoryList.forEach(c => {
      groups[c.id] = [];
    });

    menuItems.forEach(item => {
      const catKey = (item.category || '').trim().toLowerCase();
      if (groups[catKey]) {
        groups[catKey].push(item);
      } else {
        // Fallback for unmapped category
        groups[catKey] = [item];
      }
    });

    return groups;
  }, [categoryList, menuItems]);

  // Active categories to display
  const activeCategoriesToDisplay = useMemo(() => {
    if (selectedCategory === 'all') {
      return categoryList;
    }
    return categoryList.filter(c => c.id === selectedCategory);
  }, [selectedCategory, categoryList]);

  // Handle category pill click
  const handleCategoryClick = (catId) => {
    setSelectedCategory(catId);
    if (catId === 'all') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setTimeout(() => {
        const el = sectionRefs.current[catId];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50);
    }
  };

  return (
    <div className="digital-menu-root">
      <div className="digital-menu-container">
        {/* ─── HEADER ─── */}
        <header className="dm-header">
          <div className="dm-logo-wrap">
            <img
              src="/brand/sufis-logo.png"
              alt="Sufi's Cafe"
              className="dm-logo"
            />
          </div>
          <h1 className="dm-cafe-name">Sufi&apos;s Cafe</h1>
          <div className="dm-tagline">COFFEE &nbsp;·&nbsp; COMFORT &nbsp;·&nbsp; CONNECTION</div>
          <p className="dm-quote">Let the heart find peace in every sip.</p>
        </header>

        {/* ─── CATEGORY PILL NAVIGATION ─── */}
        {categoryList.length > 0 && (
          <div className="dm-category-nav-wrapper">
            <nav className="dm-category-nav" aria-label="Menu categories">
              <button
                type="button"
                className={`dm-category-pill ${selectedCategory === 'all' ? 'active' : ''}`}
                onClick={() => handleCategoryClick('all')}
              >
                All
              </button>
              {categoryList.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  className={`dm-category-pill ${selectedCategory === cat.id ? 'active' : ''}`}
                  onClick={() => handleCategoryClick(cat.id)}
                >
                  {cat.name}
                </button>
              ))}
            </nav>
          </div>
        )}

        {/* ─── MENU CONTENT ─── */}
        {loading ? (
          <div className="dm-loading">
            <div className="dm-spinner" />
            <p>Brewing our menu for you...</p>
          </div>
        ) : categoryList.length === 0 ? (
          <div className="dm-empty">
            <p>Our kitchen is currently preparing the menu. Please check back shortly.</p>
          </div>
        ) : (
          <div className="dm-cards-list">
            {activeCategoriesToDisplay.map(cat => {
              const items = groupedItems[cat.id] || [];
              if (items.length === 0) return null;

              const subtitle =
                CATEGORY_SUBTITLES[cat.id] ||
                CATEGORY_SUBTITLES[cat.name.toLowerCase()] ||
                'Crafted with love & premium ingredients';

              return (
                <section
                  key={cat.id}
                  className="dm-menu-card"
                  ref={el => { sectionRefs.current[cat.id] = el; }}
                  id={`cat-${cat.id}`}
                >
                  <div className="dm-card-header">
                    <h2 className="dm-card-title">{cat.name}</h2>
                    <p className="dm-card-subtitle">{subtitle}</p>
                    <div className="dm-card-divider" />
                  </div>

                  <div className="dm-items-wrap">
                    {items.map(item => (
                      <div key={item._id} className="dm-item-row">
                        <span className="dm-item-name">{item.name}</span>
                        <span className="dm-item-price">₹{item.price}</span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* ─── FOOTER ─── */}
        <footer className="dm-footer">
          <p className="dm-footer-quote">&ldquo;Where every sip brings peace to your soul.&rdquo;</p>
          <div className="dm-footer-tagline">GOOD FOOD &nbsp;·&nbsp; GOOD MOOD &nbsp;·&nbsp; GOOD VIBES</div>
          <div className="dm-footer-info">Free Wi-Fi &nbsp;·&nbsp; Follow us @sufis.cafe</div>
          <p className="dm-footer-fine">
            Prices are in INR, taxes applicable. Please inform us about any allergies.
          </p>
        </footer>
      </div>
    </div>
  );
}


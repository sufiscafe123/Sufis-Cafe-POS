'use client';

import React from 'react';
import { useNavigate, useLocation, Navigate } from '@/lib/router';
import { Coffee, Gift, House, User } from 'lucide-react';
import { useCustomer } from './CustomerContext';

// Page titles shown in the top bar (the home screen has its own header)
const TITLES = [
  ['/customer/menu', 'Our Menu'],
  ['/customer/rewards', 'Rewards'],
  ['/customer/profile', 'My Profile'],
  ['/customer/cart', 'Your Cart'],
  ['/customer/bill', 'Your Bill'],
  ['/customer/order', 'Your Order'],
  ['/customer/pay', 'Payment'],
];

export default function CustomerLayout({ children }) {
  const { customer, tableNumber, tableKey, isCounter, cartCount, cartSubtotal } = useCustomer();
  const navigate = useNavigate();
  const location = useLocation();

  // If customer is not logged in, redirect to login page preserving table query
  if (!customer) {
    const k = tableKey ? `&k=${encodeURIComponent(tableKey)}` : '';
    return <Navigate to={isCounter ? `/customer?counter=1${k}` : tableNumber ? `/customer?table=${tableNumber}${k}` : '/customer'} replace />;
  }

  const currentPath = location.pathname;

  const navItems = [
    { label: 'Home', path: '/customer/home', Icon: House },
    { label: 'Menu', path: '/customer/menu', Icon: Coffee },
    { label: 'Rewards', path: '/customer/rewards', Icon: Gift },
    { label: 'Profile', path: '/customer/profile', Icon: User }
  ];

  return (
    <div className="customer-viewport">
      <div className="customer-mobile-container">
        {/* Top Sticky Header */}
        {currentPath !== '/customer/home' && (
        <header className="st-header">
          <img className="st-header-logo" src="/brand/sufis-logo.png" alt="Sufi's Cafe" onClick={() => navigate('/customer/home')} />
          <div className="st-header-text">
            <div className="st-header-title">{(TITLES.find(([p]) => currentPath.startsWith(p)) || [null, "Sufi's Cafe"])[1]}</div>
            <div className="st-header-sub">Hi, {customer?.name?.split(' ')[0] || 'Guest'}</div>
          </div>
          <div className="st-table-pill">{isCounter ? 'Counter' : `T-${tableNumber}`}</div>
        </header>
        )}

        {/* Child Page Content */}
        <main style={{ flex: 1 }}>
          {children}
        </main>

        {/* Floating Cart Pill when items are added (hidden when on /customer/cart or /customer/bill) */}
        {!isCounter && cartCount > 0 && !currentPath.includes('/cart') && !currentPath.includes('/bill') && (
          <div
            className="cust-cart-pill"
            onClick={() => navigate('/customer/cart')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🛒</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>
                  {cartCount} item{cartCount > 1 ? 's' : ''} in cart
                </div>
                <div style={{ fontSize: 11, opacity: 0.9 }}>
                  Ready to send to kitchen
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 15 }}>
              <span>₹{cartSubtotal}</span>
              <span>→</span>
            </div>
          </div>
        )}

        {/* Bottom Navigation Bar */}
        <nav className="cust-bottom-nav st-nav">
          {navItems.map(item => {
            const active = currentPath === item.path || (item.path === '/customer/home' && currentPath === '/customer');
            return (
              <button
                key={item.path}
                className={`cust-nav-item st-nav-item ${active ? 'active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <span className="st-nav-icon"><item.Icon size={21} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" /></span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

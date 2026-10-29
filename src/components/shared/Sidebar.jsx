'use client';

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from '@/lib/router';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import BillRequestBell from './BillRequestBell';

function NavItem({ icon, label, path, navigate, location, onNavigate }) {
  const active = location.pathname === path || location.pathname.startsWith(path + '/');
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={() => { navigate(path); onNavigate?.(); }}>
      <span className="icon">{icon}</span>
      {label}
    </button>
  );
}

export default function Sidebar({ role }) {
  const { user, restaurant, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const nav = (path) => navigate(path);
  const [open, setOpen] = useState(false);

  // Close the mobile drawer whenever the route changes
  useEffect(() => { setOpen(false); }, [location.pathname]);

  const adminLinks = [
    { icon: '📊', label: 'Dashboard', path: '/admin/dashboard' },
    { icon: '🪑', label: 'Tables', path: '/admin/tables' },
    { icon: '🛍️', label: 'Takeaway', path: '/admin/takeaway' },
    { icon: '🍽️', label: 'Menu', path: '/admin/menu' },
    { icon: '📋', label: 'Orders', path: '/admin/orders' },
    { icon: '💳', label: 'Billing', path: '/admin/billing' },
    { icon: '👥', label: 'Customers', path: '/admin/customers' },
    { icon: '📈', label: 'Reports', path: '/admin/reports' },
    { icon: '🧑‍💼', label: 'Staff', path: '/admin/staff' },
    { icon: '⚙️', label: 'Settings', path: '/admin/settings' },
  ];

  const waiterLinks = [
    { icon: '🪑', label: 'Tables', path: '/waiter/tables' },
    { icon: '📋', label: 'My Orders', path: '/waiter/orders' },
  ];

  const kitchenLinks = [
    { icon: '🔔', label: 'Live Orders', path: '/kitchen/orders' },
    { icon: '✅', label: 'Completed', path: '/kitchen/completed' },
  ];

  const links = role === 'admin' ? adminLinks : role === 'waiter' ? waiterLinks : kitchenLinks;

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  return (
    <>
      {/* Mobile top bar with hamburger — only visible on small screens */}
      <div className="mobile-topbar">
        <button className="hamburger-btn" onClick={() => setOpen(o => !o)} aria-label="Toggle menu">
          ☰
        </button>
        <span className="mobile-topbar-title">🍽️ {restaurant?.name || 'SRMS'}</span>
        {role !== 'kitchen' && <BillRequestBell role={role} variant="topbar" />}
      </div>

      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}

      <div className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <h2>🍽️ {restaurant?.name || 'SRMS'}</h2>
            <p>Restaurant Management</p>
          </div>
          {/* Bill requests (the mobile top bar has its own bell) */}
          {role !== 'kitchen' && <div className="sidebar-bell"><BillRequestBell role={role} /></div>}
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section-label">{role === 'kitchen' ? 'Kitchen Panel' : role === 'waiter' ? 'Waiter Panel' : 'Admin Panel'}</div>
          {links.map(l => (
            <NavItem key={l.path} {...l} navigate={nav} location={location} onNavigate={() => setOpen(false)} />
          ))}
          {role === 'admin' && (
            <>
              <div className="nav-section-label" style={{ marginTop: 8 }}>Quick Access</div>
              <NavItem icon="🧑‍🍳" label="Waiter View" path="/waiter/tables" navigate={nav} location={location} onNavigate={() => setOpen(false)} />
              <NavItem icon="👨‍🍳" label="Kitchen View" path="/kitchen/orders" navigate={nav} location={location} onNavigate={() => setOpen(false)} />
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{user?.name?.charAt(0).toUpperCase()}</div>
            <div>
              <div className="user-name">{user?.name}</div>
              <div className="user-role">{user?.role}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            🚪 Logout
          </button>
        </div>
      </div>
    </>
  );
}

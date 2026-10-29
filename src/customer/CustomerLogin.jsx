'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams, Navigate } from '@/lib/router';
import { useCustomer } from './CustomerContext';
import toast from 'react-hot-toast';
import { ArrowRight, Gift, Leaf, Phone, ScanLine, User } from 'lucide-react';
import CoffeeBean from './CoffeeBean';

export default function CustomerLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loginCustomer, tableNumber, tableKey, customer, restaurantInfo } = useCustomer();

  const urlTable = searchParams.get('table');
  const parsedUrlTable = parseInt(urlTable, 10);
  const initialTable = searchParams.get('counter')
    ? 'counter'
    : Number.isInteger(parsedUrlTable) && parsedUrlTable > 0 ? parsedUrlTable : tableNumber;
  const atCounter = initialTable === 'counter';
  // The key printed in the QR code; a table typed into the address bar has none
  const qrKey = searchParams.get('k') || (initialTable === tableNumber ? tableKey : null);

  // Returning guests on the same phone don't have to type their details again
  const lastDetails = (() => {
    try { return JSON.parse(localStorage.getItem('srms_customer_last_details')) || {}; } catch { return {}; }
  })();
  const [name, setName] = useState(lastDetails.name || '');
  const [phone, setPhone] = useState(lastDetails.phone || '');
  const [loading, setLoading] = useState(false);

  // Ask the server whether the key really belongs to this table before showing the form
  const qrId = initialTable && qrKey ? `${initialTable}:${qrKey}` : null;
  const [qrCheck, setQrCheck] = useState({ id: null, valid: false });
  useEffect(() => {
    if (!qrId) return;
    let live = true;
    axios.post('/api/customers/qr-check', initialTable === 'counter'
      ? { counter: true, key: qrKey }
      : { tableNumber: initialTable, key: qrKey })
      .then(r => live && setQrCheck({ id: qrId, valid: r.data?.valid === true }))
      // Network trouble: show the form; check-in itself is still verified by the server
      .catch(() => live && setQrCheck({ id: qrId, valid: true }));
    return () => { live = false; };
  }, [qrId]);
  const qrChecking = qrId && qrCheck.id !== qrId;
  const qrValid = qrId && qrCheck.id === qrId && qrCheck.valid;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter your full name');
      return;
    }
    if (!phone.trim() || phone.replace(/\D/g, '').length < 10) {
      toast.error('Please enter a valid 10-digit phone number');
      return;
    }

    setLoading(true);
    try {
      await loginCustomer(name.trim(), phone.trim(), initialTable, qrKey);
      toast.success(atCounter ? `Welcome, ${name.trim()}! 👋` : `Welcome to Table ${initialTable}, ${name.trim()}! 👋`, {
        icon: '🍽️',
        duration: 3500
      });
      navigate('/customer/home');
    } catch (err) {
      // Error is handled in context
    } finally {
      setLoading(false);
    }
  };

  // Already checked in at this table
  if (customer && initialTable && initialTable === tableNumber) {
    return <Navigate to="/customer/home" replace />;
  }

  if (qrChecking) {
    return (
      <div className="customer-viewport sh-page sl-page">
        <div className="sh-hero sl-hero" />
        <div className="sh-sheet sl-sheet" style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  // Opened without a valid table QR code (or the table number in the link was changed)
  if (!qrValid) {
    return (
      <div className="customer-viewport sh-page sl-page">
        <div className="sh-hero sl-hero" />
        <div className="sh-sheet sl-sheet">
          <img className="sh-logo" src="/brand/sufis-logo.png" alt="Sufi's Cafe logo" />
          <div className="sh-brand">
            <h1 className="sh-title">Sufi&apos;s Cafe</h1>
            <div className="sh-tagline">COFFEE · COMFORT · CONNECTION</div>
            <div className="sh-divider"><CoffeeBean size={16} /></div>
          </div>
          <div className="sl-card" style={{ textAlign: 'center' }}>
            <ScanLine size={44} strokeWidth={1.5} color="#2D6144" aria-hidden="true" />
            <h2 className="sl-heading">Scan your table&apos;s QR code</h2>
            <p className="sl-sub">
              Please scan the QR code placed on your table to view the menu and order. Ask a staff member if you can&apos;t find it.
            </p>
          </div>
          <div className="sl-fine">Prices in INR • Taxes applicable • Please inform us about allergies</div>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-viewport sh-page sl-page">
      {/* Hero photo with the table chip */}
      <div className="sh-hero sl-hero">
        <div className="sh-chip">{atCounter ? 'Counter' : `T-${initialTable}`}</div>
      </div>

      <div className="sh-sheet sl-sheet">
        <img className="sh-logo" src="/brand/sufis-logo.png" alt="Sufi's Cafe logo" />
        <div className="sh-brand">
          <h1 className="sh-title">{restaurantInfo?.name || "Sufi's Cafe"}</h1>
          <div className="sh-tagline">COFFEE · COMFORT · CONNECTION</div>
          <div className="sh-divider"><CoffeeBean size={16} /></div>
        </div>

        <form onSubmit={handleSubmit} className="sl-card">
          <h2 className="sl-heading"><Leaf size={16} strokeWidth={1.8} style={{ transform: 'rotate(-20deg)' }} aria-hidden="true" /> Welcome <Leaf size={16} strokeWidth={1.8} style={{ transform: 'scaleX(-1) rotate(-20deg)' }} aria-hidden="true" /></h2>
          <p className="sl-sub">
            {atCounter
              ? 'Enter your details to collect loyalty stamps and rewards'
              : 'Enter your details to explore the menu and earn loyalty stamps'}
          </p>

          <label className="sl-label" htmlFor="sl-name">Full Name</label>
          <div className="sl-field">
            <User size={18} color="#55665B" aria-hidden="true" />
            <input
              id="sl-name"
              type="text"
              placeholder="Your name"
              autoComplete="name"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={loading}
            />
          </div>

          <label className="sl-label" htmlFor="sl-phone">Phone Number</label>
          <div className="sl-field">
            <Phone size={18} color="#55665B" aria-hidden="true" />
            <span className="sl-prefix">+91</span>
            <input
              id="sl-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="98765 43210"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              disabled={loading}
            />
          </div>

          <button type="submit" className="sl-button" disabled={loading}>
            {loading ? (atCounter ? 'Checking you in…' : 'Setting up your table…') : 'Continue'}
            {!loading && <ArrowRight size={20} aria-hidden="true" />}
          </button>

          <div className="sl-perk"><Gift size={16} strokeWidth={1.8} aria-hidden="true" /> Earn a free stamp with every visit</div>
        </form>

        <div className="sl-fine">By continuing, you agree to our Terms &amp; Privacy.</div>
      </div>
    </div>
  );
}


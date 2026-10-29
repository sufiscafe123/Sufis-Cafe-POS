'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { BookOpen, Star, Wifi, ChevronRight, Gift, Check, Leaf, Copy, ConciergeBell, ReceiptIndianRupee } from 'lucide-react';
import { useNavigate } from '@/lib/router';
import { useCustomer } from './CustomerContext';
import { useBillRequest } from './useBillRequest';
import CoffeeBean from './CoffeeBean';

// Details shown to guests. Set them in .env.local (see .env.example).
const REVIEW_URL = process.env.NEXT_PUBLIC_REVIEW_URL || '';
const WIFI_NAME = process.env.NEXT_PUBLIC_WIFI_NAME || '';
const WIFI_PASSWORD = process.env.NEXT_PUBLIC_WIFI_PASSWORD || '';
const INSTAGRAM = (process.env.NEXT_PUBLIC_INSTAGRAM || 'sufis.cafe').replace(/^@/, '');

const STATUS_TEXT = { awaiting: 'Waiting for staff to confirm', pending: 'Order received', accepted: 'Accepted', preparing: 'Being prepared', ready: 'Ready', served: 'Served' };


function InstagramIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#1C3022" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.9" fill="#1C3022" stroke="none" />
    </svg>
  );
}

const sprig = (flip) => <Leaf size={16} strokeWidth={1.8} style={{ transform: flip ? 'scaleX(-1) rotate(-20deg)' : 'rotate(-20deg)' }} aria-hidden="true" />;

export default function CustomerHome() {
  const { customer, tableNumber, activeOrder, refreshCustomer, loyaltySettings, isCounter, visitEnded, viewOnly, logoutAt } = useCustomer();
  const billRequest = useBillRequest();
  const navigate = useNavigate();
  const [wifiOpen, setWifiOpen] = useState(false);
  const [callingWaiter, setCallingWaiter] = useState(false);

  useEffect(() => {
    if (typeof refreshCustomer === 'function') refreshCustomer();
  }, []);

  // ── Stamp card ──
  const totalStamps = customer?.totalStamps || 0;
  const stampsPerCard = loyaltySettings?.stampsPerCard || 8;
  const milestones = (loyaltySettings?.milestones || []).filter(m => m.isActive !== false);
  const currentCardStamps = totalStamps === 0 ? 0 : ((totalStamps - 1) % stampsPerCard) + 1;
  // After "Ask for Bill", the stamp this bill will earn shows as pending until the bill is generated
  const pendingSlot = billRequest.stampPending && currentCardStamps < stampsPerCard ? currentCardStamps + 1 : null;
  const slots = Array.from({ length: stampsPerCard }, (_, i) => i + 1);

  const callWaiter = async () => {
    if (callingWaiter) return;
    setCallingWaiter(true);
    try {
      await axios.post('/api/customers/me/call-waiter');
      toast.success('A waiter is on the way', { id: 'call-waiter' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not reach the waiter. Please try again.', { id: 'call-waiter' });
    } finally {
      setCallingWaiter(false);
    }
  };

  const openReview = () => {
    if (REVIEW_URL) window.open(REVIEW_URL, '_blank', 'noopener');
    else toast('Thank you! Please share your feedback with our staff.', { icon: '⭐', id: 'review' });
  };

  const copyWifi = async () => {
    try {
      await navigator.clipboard.writeText(WIFI_PASSWORD);
      toast.success('Password copied', { id: 'wifi-copy' });
    } catch {
      toast(WIFI_PASSWORD, { id: 'wifi-copy' });
    }
  };

  // No table number once the visit is over (table billed)
  const tableLabel = isCounter ? 'Counter' : visitEnded ? '' : `T-${tableNumber ?? ''}`;

  return (
    <div className="sh-page">
      {/* Exactly one phone screen: photo, brand, loyalty, menu and the four buttons */}
      <div className="sh-screen">
      {/* Hero photo with the table chip */}
      <div className="sh-hero">
        {tableLabel && <div className="sh-chip">{tableLabel}</div>}
      </div>

      <div className="sh-sheet">
        <img className="sh-logo" src="/brand/sufis-logo.png" alt="Sufi's Cafe logo" />

        <div className="sh-brand">
          <h1 className="sh-title">Sufi&apos;s Cafe</h1>
          <div className="sh-tagline">COFFEE · COMFORT · CONNECTION</div>
          <div className="sh-divider"><CoffeeBean size={16} /></div>
        </div>

        <div className="sh-fill">
        {/* Loyalty stamp card */}
        <div className="sh-loyalty" onClick={() => navigate('/customer/rewards')} role="button" aria-label="Open your rewards">
          <div className="sh-loyalty-title">{sprig(false)}LOYALTY REWARDS{sprig(true)}</div>
          <div className="sh-stamps" style={{ '--sh-cols': stampsPerCard }}>
            {slots.map(num => {
              const goal = milestones.find(m => m.requiredStamps === num);
              const stamped = num <= currentCardStamps;
              const pending = num === pendingSlot;
              return (
                <div key={num} className="sh-slot">
                  <div className={`sh-bubble ${goal ? 'goal' : ''} ${goal && stamped ? 'reached' : ''} ${pending ? 'pending' : ''}`}>
                    {pending
                      ? <CoffeeBean size={22} color="#B45309" outline />
                      : goal
                        ? <Gift size={20} strokeWidth={1.8} aria-hidden="true" />
                        : stamped ? <CoffeeBean size={24} /> : null}
                    {goal && stamped && <span className="sh-tick"><Check size={11} strokeWidth={3} aria-hidden="true" /></span>}
                  </div>
                  <div className="sh-num">{num}</div>
                  {goal && <div className="sh-goal-label">{goal.title}</div>}
                </div>
              );
            })}
          </div>
          <div className="sh-collect">Collect {stampsPerCard} stamps &amp; enjoy amazing rewards!</div>
          {billRequest.stampPending && <div className="sh-note">⭐ +1 stamp pending. It is added when your bill is generated.</div>}
        </div>

        {/* Live order (only while one is open) */}
        {visitEnded && (
          <div className="sh-order" style={{ cursor: 'default' }}>
            <span>☕ Thank you for visiting! Menu &amp; rewards stay open{logoutAt ? ` till ${new Date(logoutAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}.</span>
          </div>
        )}
        {!viewOnly && activeOrder && (
          <div className="sh-order" onClick={() => navigate('/customer/order-status')}>
            <span>🍽️ Order #{activeOrder.orderNumber} · {STATUS_TEXT[activeOrder.status] || activeOrder.status}</span>
            <span>Track →</span>
          </div>
        )}

        <button className="sh-menu" onClick={() => navigate('/customer/menu')}>
          <span>
            <span className="sh-menu-title" style={{ display: 'block' }}>View Menu</span>
            <span className="sh-menu-sub" style={{ display: 'block' }}>{viewOnly ? 'Tap to explore our menu' : 'Tap to order straight to your table'}</span>
          </span>
          <BookOpen size={46} strokeWidth={1.4} aria-hidden="true" />
        </button>

        <div className="sh-grid">
          {!viewOnly && (
            <>
              <button className="sh-tile" onClick={callWaiter} disabled={callingWaiter}>
                <ConciergeBell size={27} strokeWidth={1.5} color="#244D39" aria-hidden="true" />
                <span className="sh-tile-text"><span className="sh-tile-title" style={{ display: 'block' }}>Call Waiter</span><span className="sh-tile-sub" style={{ display: 'block' }}>{callingWaiter ? 'Calling…' : 'Need assistance?'}</span></span>
                <ChevronRight size={18} color="#284C3A" aria-hidden="true" />
              </button>
              <button className="sh-tile" onClick={billRequest.start}>
                <ReceiptIndianRupee size={27} strokeWidth={1.5} color="#244D39" aria-hidden="true" />
                <span className="sh-tile-text">
                  <span className="sh-tile-title" style={{ display: 'block' }}>{billRequest.requested ? 'Bill requested' : 'Ask for Bill'}</span>
                  <span className="sh-tile-sub" style={{ display: 'block' }}>{billRequest.requested ? 'Waiter notified ✓' : "We'll bring it to you"}</span>
                </span>
                <ChevronRight size={18} color="#284C3A" aria-hidden="true" />
              </button>
            </>
          )}
          <button className="sh-tile" onClick={openReview}>
            <Star size={27} strokeWidth={1.5} color="#244D39" aria-hidden="true" />
            <span className="sh-tile-text"><span className="sh-tile-title" style={{ display: 'block' }}>Leave a Review</span><span className="sh-tile-sub" style={{ display: 'block' }}>Tell us how we did</span></span>
            <ChevronRight size={18} color="#284C3A" aria-hidden="true" />
          </button>
          <button className="sh-tile" onClick={() => setWifiOpen(true)}>
            <Wifi size={27} strokeWidth={1.5} color="#244D39" aria-hidden="true" />
            <span className="sh-tile-text"><span className="sh-tile-title" style={{ display: 'block' }}>Free Wi-Fi</span><span className="sh-tile-sub" style={{ display: 'block' }}>Get the password</span></span>
            <ChevronRight size={18} color="#284C3A" aria-hidden="true" />
          </button>
        </div>
        </div>
      </div>
      </div>
        {billRequest.sheet}

        {/* Footer (below the first screen) */}
        <div className="sh-foot">
          <div className="sh-quote">
            <span style={{ color: '#4C7A5D' }}>{sprig(false)}</span> Where every sip brings<br />peace to your soul.&rdquo; <span style={{ color: '#4C7A5D' }}>{sprig(true)}</span>
          </div>
          <div className="sh-divider" style={{ marginTop: 14 }}><CoffeeBean size={16} /></div>
          <a className="sh-insta" href={`https://instagram.com/${INSTAGRAM}`} target="_blank" rel="noopener noreferrer">
            <InstagramIcon /> @{INSTAGRAM}
          </a>
          <div className="sh-fine">Prices in INR • Taxes applicable • Please inform us about allergies</div>
        </div>

      {/* Wi-Fi details */}
      {wifiOpen && (
        <div className="cust-modal-backdrop" onClick={() => setWifiOpen(false)}>
          <div className="cust-modal-sheet" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <div style={{ width: 40, height: 4, background: '#CBD5E0', borderRadius: 2 }} />
            </div>
            <Wifi size={40} color="#2D6144" aria-hidden="true" />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1A2E22', margin: '8px 0 14px' }}>Free Wi-Fi</h3>
            {WIFI_PASSWORD ? (
              <div style={{ background: '#F4F1E9', borderRadius: 14, padding: '12px 16px', textAlign: 'left', marginBottom: 16 }}>
                {WIFI_NAME && <div style={{ fontSize: 13, color: '#55665B' }}>Network <strong style={{ color: '#1F3226' }}>{WIFI_NAME}</strong></div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 13, color: '#55665B' }}>Password <strong style={{ color: '#1F3226', fontSize: 16, letterSpacing: 0.5 }}>{WIFI_PASSWORD}</strong></span>
                  <button onClick={copyWifi} aria-label="Copy password" style={{ background: '#2D6144', color: '#fff', border: 'none', borderRadius: 10, padding: '6px 10px', cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center', fontWeight: 700, fontSize: 12 }}>
                    <Copy size={14} aria-hidden="true" /> Copy
                  </button>
                </div>
              </div>
            ) : (
              <p style={{ color: '#55665B', fontSize: '0.92rem', marginBottom: 16 }}>Please ask our staff for the Wi-Fi password.</p>
            )}
            <button className="btn-customer-secondary" style={{ width: '100%' }} onClick={() => setWifiOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

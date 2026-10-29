'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// The link inside the customer's reward QR: scanning it opens the staff Scan QR page for them.
const claimLink = (token) => {
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '') || window.location.origin;
  return `${base}/admin/scan-qr?token=${encodeURIComponent(token)}`;
};

/**
 * "Claim at counter": the customer shows this to the counter staff, who scan the QR (or search
 * the phone number) and tap Claim. The reward then moves to "Claimed" on this phone, live.
 */
export default function ClaimAtCounter({ reward, customer, onClose }) {
  const [img, setImg] = useState('');

  useEffect(() => {
    if (!customer?.rewardToken) return;
    QRCode.toDataURL(claimLink(customer.rewardToken), { width: 520, margin: 1, color: { dark: '#1A2E22', light: '#FFFFFF' } })
      .then(setImg).catch(() => setImg(''));
  }, [customer?.rewardToken]);

  return (
    <div className="cust-modal-backdrop" onClick={onClose}>
      <div className="cust-modal-sheet" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 40, height: 4, background: '#CBD5E0', borderRadius: 2 }} />
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#2D6144', letterSpacing: 0.5 }}>SHOW THIS AT THE COUNTER</div>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 900, color: '#1A2E22', margin: '4px 0 2px' }}>🎁 {reward.title}</h3>
        <p style={{ fontSize: '0.85rem', color: '#5A6E62', marginBottom: 14 }}>
          {reward.description || 'Your free item is ready to claim.'}
        </p>

        <div style={{ display: 'inline-block', padding: 12, border: '2px solid #2D6144', borderRadius: 18, background: '#FFFFFF' }}>
          {img
            ? <img src={img} alt="Reward QR code" style={{ width: 200, height: 200, display: 'block' }} />
            : <div style={{ width: 200, height: 200 }} />}
        </div>

        <div style={{
          marginTop: 14, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 14, padding: '10px 14px',
          display: 'flex', justifyContent: 'space-between', textAlign: 'left', fontSize: '0.85rem'
        }}>
          <div>
            <div style={{ fontWeight: 800, color: '#1A2E22' }}>{customer?.name}</div>
            <div style={{ color: '#64748B' }}>📞 {customer?.phone}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#64748B' }}>Customer ID</div>
            <div style={{ fontWeight: 800, color: '#2D6144', fontFamily: 'monospace' }}>{customer?.customerId}</div>
          </div>
        </div>
        <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '12px 0 14px' }}>
          The staff scans this code or looks up your phone number, then your reward shows as claimed here.
        </p>
        <button className="btn-customer-secondary" style={{ width: '100%' }} onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from '@/lib/router';
import axios from 'axios';
import toast from 'react-hot-toast';

const StaffScanQR = () => {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';

  const [inputToken, setInputToken] = useState(tokenFromUrl);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isAddingStamp, setIsAddingStamp] = useState(false);
  const [stampResult, setStampResult] = useState(null);

  useEffect(() => {
    if (tokenFromUrl) {
      setInputToken(tokenFromUrl);
      lookupToken(tokenFromUrl);
    }
  }, [tokenFromUrl]);

  const lookupToken = async (tok) => {
    // Accepts the bare token or the link from the customer's reward QR (…/admin/scan-qr?token=RWD_…)
    const raw = (tok || inputToken || '').trim();
    const queryTok = (raw.match(/[?&]token=([^&#]+)/)?.[1] && decodeURIComponent(raw.match(/[?&]token=([^&#]+)/)[1])) || raw;
    if (!queryTok) {
      toast.error('Please enter or scan a valid reward token');
      return;
    }

    try {
      setLoading(true);
      setStampResult(null);
      const res = await axios.get(`/api/customers/token/${encodeURIComponent(queryTok)}`);
      setCustomer(res.data);
      toast.success(`Found profile for ${res.data.name}`);
    } catch (err) {
      console.error('Customer token lookup error:', err);
      toast.error(err.response?.data?.message || 'Customer reward token not found');
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  };

  const [claimingId, setClaimingId] = useState(null);
  const handleClaim = async (rw) => {
    if (!customer || !window.confirm(`Give ${rw.title} to ${customer.name}?`)) return;
    try {
      setClaimingId(rw._id);
      const res = await axios.post(`/api/customers/${customer._id}/rewards/${rw._id}/claim`);
      setCustomer(res.data.customer);
      toast.success(`🎁 ${rw.title} claimed for ${customer.name}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not claim the reward');
    } finally {
      setClaimingId(null);
    }
  };

  const handleAddStamp = async () => {
    if (!customer) return;

    try {
      setIsAddingStamp(true);
      // The staff login travels in the session cookie
      const res = await axios.post(
        '/api/customers/add-stamp',
        {
          customerId: customer.customerId,
          rewardToken: customer.rewardToken,
          stampsToAdd: 1
        }
      );

      setStampResult(res.data);
      setCustomer(res.data.customer);

      if (res.data.unlockedReward) {
        toast.success(`🎉 ${res.data.unlockedReward.name} Unlocked!`, { duration: 5000 });
      } else {
        toast.success(`Stamp added! Total: ${res.data.totalStamps}`);
      }
    } catch (err) {
      console.error('Error adding stamp:', err);
      toast.error(err.response?.data?.message || 'Failed to add stamp');
    } finally {
      setIsAddingStamp(false);
    }
  };

  const totalStamps = customer?.totalStamps || 0;
  const stampsInCycle = totalStamps % 8;

  return (
    <div style={{ padding: '24px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>
          📷 Scan / Lookup Customer Reward QR
        </h2>
        <p style={{ color: '#64748b', fontSize: '0.92rem' }}>
          Scan the QR code shown on the customer's phone or enter their reward token to add stamps and verify rewards.
        </p>
      </div>

      {/* Input / Scanner simulation form */}
      <div style={{
        background: '#ffffff',
        borderRadius: 18,
        padding: '20px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        border: '1px solid #e2e8f0',
        marginBottom: 24
      }}>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: 8 }}>
          Customer Reward Token or Scanned URL
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            className="input-field"
            placeholder="Paste reward token or URL (e.g. REW_10045_...)"
            value={inputToken}
            onChange={(e) => setInputToken(e.target.value)}
            style={{ flex: 1, height: 46, fontSize: '0.92rem' }}
          />
          <button
            onClick={() => lookupToken(inputToken)}
            disabled={loading}
            style={{
              background: '#087F45',
              color: '#ffffff',
              border: 'none',
              borderRadius: 12,
              padding: '0 24px',
              fontWeight: 700,
              fontSize: '0.92rem',
              cursor: 'pointer'
            }}
          >
            {loading ? 'Searching...' : 'Lookup Customer'}
          </button>
        </div>

      </div>

      {/* Identified Customer Profile Card */}
      {customer && (
        <div style={{
          background: '#ffffff',
          borderRadius: 22,
          padding: '24px',
          boxShadow: '0 6px 24px rgba(8,127,69,0.12)',
          border: '2px solid #86efac',
          position: 'relative'
        }}>
          {/* Top customer header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #087F45 0%, #10b981 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                fontWeight: 800
              }}>
                {customer.name?.charAt(0) || 'C'}
              </div>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                  {customer.name}
                </h3>
                <div style={{ color: '#64748b', fontSize: '0.88rem', marginTop: 2 }}>
                  📞 {customer.phone} • ID: <strong style={{ color: '#087F45' }}>{customer.customerId}</strong>
                </div>
              </div>
            </div>

            <div style={{
              background: '#dcfce7',
              color: '#087F45',
              padding: '6px 14px',
              borderRadius: 20,
              fontWeight: 800,
              fontSize: '0.85rem'
            }}>
              Active Customer
            </div>
          </div>

          {/* Milestone and stamps display */}
          <div style={{
            background: '#f8fafc',
            borderRadius: 16,
            padding: '18px',
            marginBottom: 20,
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 800, color: '#1e293b', fontSize: '1rem' }}>
                Loyalty Progress
              </span>
              <span style={{ fontWeight: 800, color: '#087F45', fontSize: '1.05rem' }}>
                {stampsInCycle} / 8 Stamps (Total: {totalStamps})
              </span>
            </div>

            {/* Stamp progress dots */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                <div
                  key={s}
                  style={{
                    flex: 1,
                    height: 38,
                    borderRadius: 10,
                    background: s <= stampsInCycle ? '#087F45' : '#ffffff',
                    border: s <= stampsInCycle ? '1px solid #087F45' : '1px dashed #cbd5e1',
                    color: s <= stampsInCycle ? '#ffffff' : '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.85rem'
                  }}
                >
                  {s <= stampsInCycle ? '✓' : s === 4 ? '☕' : s === 8 ? '🎁' : s}
                </div>
              ))}
            </div>

            <div style={{ fontSize: '0.88rem', color: '#334155', fontWeight: 600 }}>
              {stampsInCycle < 4 ? (
                <>Next Reward: <span style={{ color: '#087F45' }}>☕ FREE Coffee</span> at 4 stamps ({4 - stampsInCycle} more needed)</>
              ) : stampsInCycle < 8 ? (
                <>Next Milestone: <span style={{ color: '#087F45' }}>🏷️ 20% OFF</span> at 8 stamps ({8 - stampsInCycle} more needed)</>
              ) : (
                <>🎉 Maximum stamps in this cycle reached!</>
              )}
            </div>
          </div>

          {/* Unlocked / Celebration banner if stamp was just added */}
          {stampResult && stampResult.unlockedReward && (
            <div style={{
              background: 'linear-gradient(135deg, #087F45 0%, #10b981 100%)',
              color: '#ffffff',
              borderRadius: 16,
              padding: '16px 20px',
              textAlign: 'center',
              marginBottom: 20,
              boxShadow: '0 6px 20px rgba(8,127,69,0.25)'
            }}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>🎉</div>
              <h4 style={{ fontSize: '1.2rem', fontWeight: 900, margin: '0 0 4px 0' }}>
                Reward Unlocked for Customer!
              </h4>
              <p style={{ margin: 0, fontSize: '0.92rem', opacity: 0.95 }}>
                {stampResult.unlockedReward.name} has been added to their wallet.
              </p>
            </div>
          )}

          {/* Available customer rewards */}
          <div style={{ marginBottom: 20 }}>
            <h5 style={{ fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>
              Customer's Rewards Wallet
            </h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {customer.rewards?.map((rw, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: rw.status === 'available' ? '#dcfce7' : '#f8fafc',
                    border: rw.status === 'available' ? '1px solid #86efac' : '1px solid #e2e8f0'
                  }}
                >
                  <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.88rem' }}>
                    🎁 {rw.title || rw.name}
                    {rw.status === 'redeemed' && rw.redeemedAt && (
                      <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>
                        Claimed {new Date(rw.redeemedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </span>
                  {rw.status === 'available' ? (
                    <button
                      onClick={() => handleClaim(rw)}
                      disabled={claimingId === rw._id}
                      style={{ background: '#087F45', color: '#fff', border: 'none', borderRadius: 10, padding: '6px 14px', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      {claimingId === rw._id ? 'Claiming…' : '🎁 Claim'}
                    </button>
                  ) : (
                    <span style={{
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      color: rw.status === 'redeemed' ? '#1E40AF' : '#64748b'
                    }}>
                      {rw.status === 'redeemed' ? '✓ Claimed' : '🔒 Locked'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Action: Add Stamp Button */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={handleAddStamp}
              disabled={isAddingStamp}
              style={{
                flex: 1,
                background: '#087F45',
                color: '#ffffff',
                border: 'none',
                borderRadius: 14,
                padding: '14px',
                fontWeight: 800,
                fontSize: '1rem',
                cursor: 'pointer',
                boxShadow: '0 6px 18px rgba(8,127,69,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              <span>➕</span>
              <span>{isAddingStamp ? 'Adding Stamp...' : 'Add +1 Loyalty Stamp'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffScanQR;

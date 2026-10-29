'use client';

import React, { useEffect, useState } from 'react';
import { useNavigate } from '@/lib/router';
import { useCustomer } from './CustomerContext';
import ClaimAtCounter from './ClaimAtCounter';
import CoffeeBean from './CoffeeBean';
import { Check, Coffee, Gift, Lock } from 'lucide-react';

const CustomerRewards = () => {
  const navigate = useNavigate();
  const { customer, getNextReward, refreshCustomer, loyaltySettings } = useCustomer();
  const [claimReward, setClaimReward] = useState(null);

  useEffect(() => {
    if (typeof refreshCustomer === 'function') {
      refreshCustomer();
    }
  }, []);

  const totalStamps = customer?.totalStamps || 0;
  const stampsPerCard = loyaltySettings?.stampsPerCard || 8;
  const activeMilestones = (loyaltySettings?.milestones || [])
    .filter(m => m.isActive !== false)
    .sort((a, b) => a.requiredStamps - b.requiredStamps);

  const cardCycle = Math.floor(Math.max(0, totalStamps - 1) / stampsPerCard) + 1;
  const currentStampsInCycle = totalStamps === 0 ? 0 : ((totalStamps - 1) % stampsPerCard) + 1;
  const nextReward = getNextReward();

  // All card slots dynamically generated up to stampsPerCard
  const STAMP_SLOTS = Array.from({ length: stampsPerCard }, (_, i) => {
    const num = i + 1;
    const milestone = activeMilestones.find(m => m.requiredStamps === num);
    const isGrand = num === stampsPerCard;
    return {
      num,
      type: milestone ? (isGrand ? 'grand' : 'milestone') : 'normal',
      label: milestone?.title || '',
      icon: milestone?.icon || (isGrand ? '🎁' : '☕'),
      required: num
    };
  });

  // Rewards still to earn / ready to claim, and the ones already claimed at the counter
  const allRewards = customer?.rewards || [];
  const rewardsList = allRewards.filter(r => r.status !== 'redeemed');
  const claimedRewards = allRewards
    .filter(r => r.status === 'redeemed')
    .sort((a, b) => new Date(b.redeemedAt || 0) - new Date(a.redeemedAt || 0));
  const fmtClaimed = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'available':
      case 'unlocked':
        return <span className="st-badge ready">Ready to claim</span>;
      case 'redeemed':
        return <span className="st-badge done"><Check size={12} strokeWidth={3} aria-hidden="true" /> Claimed</span>;
      case 'locked':
      default:
        return <span className="st-badge locked"><Lock size={11} strokeWidth={2.4} aria-hidden="true" /> Locked</span>;
    }
  };

  return (
    <div className="customer-page-content st-page">
      {/* Stamp card */}
      <div className="st-sage">
        <div className="st-sage-head">
          <div>
            <div className="st-eyebrow">Loyalty Pass</div>
            <h3 className="st-serif-title">Your Stamp Card {cardCycle > 1 ? `· Card ${cardCycle}` : ''}</h3>
          </div>
          <div className="st-pill">{currentStampsInCycle} / {stampsPerCard}</div>
        </div>

        <div className="st-stamp-grid">
          {STAMP_SLOTS.map((slot) => {
            const isEarned = currentStampsInCycle >= slot.num;
            const isGoal = slot.type !== 'normal';
            return (
              <div key={slot.num} className="st-stamp">
                <div className={`st-stamp-circle ${isEarned ? 'earned' : ''} ${isGoal ? 'goal' : ''}`}>
                  {isGoal
                    ? <Gift size={22} strokeWidth={1.8} aria-hidden="true" />
                    : isEarned ? <CoffeeBean size={26} /> : <span className="st-stamp-num">{slot.num}</span>}
                  {isGoal && isEarned && <span className="sh-tick"><Check size={11} strokeWidth={3} aria-hidden="true" /></span>}
                </div>
                {isGoal && <div className="st-stamp-label">{slot.label}</div>}
              </div>
            );
          })}
        </div>

        <div className="st-progress">
          <CoffeeBean size={18} />
          <div>
            {nextReward ? (
              <>
                <strong>{nextReward.stampsNeeded} more stamp{nextReward.stampsNeeded > 1 ? 's' : ''}</strong> to unlock your <strong>{nextReward.rewardName}</strong>
              </>
            ) : (
              <>You&apos;ve unlocked every reward on this card. Keep visiting to start a new card!</>
            )}
          </div>
        </div>
      </div>

      {/* Rewards to earn / ready to claim */}
      <h4 className="st-section-title">Your Rewards</h4>
      <div className="st-list">
        {rewardsList.map((reward) => (
          <div key={reward._id || reward.rewardId} className={`st-card st-reward ${reward.status === 'available' ? 'ready' : ''}`}>
            <div className="st-reward-row">
              <div className="st-reward-icon">
                {reward.title?.toLowerCase().includes('coffee') ? <Coffee size={22} strokeWidth={1.8} aria-hidden="true" /> : <Gift size={22} strokeWidth={1.8} aria-hidden="true" />}
              </div>
              <div className="st-reward-text">
                <div className="st-reward-title">{reward.title}</div>
                {reward.description && <div className="st-muted">{reward.description}</div>}
              </div>
              {getStatusBadge(reward.status)}
            </div>

            <div className="st-reward-foot">
              <span>Requires <strong>{reward.requiredStamps} stamps</strong></span>
              {reward.status === 'available' ? (
                <button className="st-btn-small" onClick={() => setClaimReward(reward)}>
                  <Gift size={14} aria-hidden="true" /> Claim at counter
                </button>
              ) : (
                <span>{totalStamps} / {reward.requiredStamps} completed</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {claimedRewards.length > 0 && (
        <>
          <h4 className="st-section-title">Claimed Rewards</h4>
          <div className="st-list">
            {claimedRewards.map(reward => (
              <div key={reward._id} className="st-card st-reward-row claimed">
                <div className="st-reward-icon muted"><Gift size={20} strokeWidth={1.8} aria-hidden="true" /></div>
                <div className="st-reward-text">
                  <div className="st-reward-title">{reward.title}</div>
                  <div className="st-muted">{reward.redeemedAt ? `Claimed on ${fmtClaimed(reward.redeemedAt)}` : 'Claimed'}</div>
                </div>
                {getStatusBadge('redeemed')}
              </div>
            ))}
          </div>
        </>
      )}

      {claimReward && (
        <ClaimAtCounter
          reward={claimReward}
          customer={customer}
          onClose={() => setClaimReward(null)}
        />
      )}
    </div>
  );
};

export default CustomerRewards;

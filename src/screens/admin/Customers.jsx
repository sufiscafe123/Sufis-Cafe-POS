'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalStampsAwarded: 0,
    activeDineInCustomers: 0,
    customersWithAvailableRewards: 0
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [addingStampId, setAddingStampId] = useState(null);

  // Tab & Loyalty Settings state
  const [activeTab, setActiveTab] = useState('directory'); // 'directory' | 'offers'
  const [loyaltySettings, setLoyaltySettings] = useState({
    stampsPerCard: 8,
    milestones: []
  });
  const [loadingLoyalty, setLoadingLoyalty] = useState(false);
  const [savingLoyalty, setSavingLoyalty] = useState(false);
  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState(null);
  const [milestoneForm, setMilestoneForm] = useState({
    milestoneId: '',
    requiredStamps: 4,
    title: '',
    description: '',
    rewardType: 'free_item',
    rewardValue: 0,
    icon: '☕'
  });

  useEffect(() => {
    loadCustomers();
    loadLoyaltySettings();
  }, [filter]);

  const loadLoyaltySettings = async () => {
    try {
      setLoadingLoyalty(true);
      const res = await axios.get('/api/loyalty-settings');
      if (res.data) {
        setLoyaltySettings(res.data);
      }
    } catch (err) {
      console.warn('Failed to load loyalty settings:', err.message);
    } finally {
      setLoadingLoyalty(false);
    }
  };

  const handleSaveLoyaltySettings = async (customSettings) => {
    try {
      setSavingLoyalty(true);
      const toSave = customSettings || loyaltySettings;
      const res = await axios.put('/api/loyalty-settings', toSave);
      setLoyaltySettings(res.data.settings);
      toast.success('🎉 Loyalty Program offers updated! Live on customer apps.');
    } catch (err) {
      toast.error('Failed to save loyalty settings');
    } finally {
      setSavingLoyalty(false);
    }
  };

  const openMilestoneModal = (milestone = null) => {
    if (milestone) {
      setEditingMilestone(milestone);
      setMilestoneForm({
        milestoneId: milestone.milestoneId || `milestone_${Date.now()}`,
        requiredStamps: milestone.requiredStamps || 4,
        title: milestone.title || '',
        description: milestone.description || '',
        rewardType: milestone.rewardType || 'free_item',
        rewardValue: milestone.rewardValue || 0,
        icon: milestone.icon || '🎁'
      });
    } else {
      setEditingMilestone(null);
      const maxStamps = loyaltySettings.milestones?.length
        ? Math.max(...loyaltySettings.milestones.map(m => m.requiredStamps))
        : 2;
      setMilestoneForm({
        milestoneId: `milestone_${Date.now()}`,
        requiredStamps: Math.min(loyaltySettings.stampsPerCard || 8, maxStamps + 2),
        title: '',
        description: '',
        rewardType: 'free_item',
        rewardValue: 0,
        icon: '🎁'
      });
    }
    setMilestoneModalOpen(true);
  };

  const handleSaveMilestoneForm = (e) => {
    e.preventDefault();
    if (!milestoneForm.title.trim()) {
      toast.error('Please enter a reward title');
      return;
    }
    const updatedMilestones = [...(loyaltySettings.milestones || [])];
    if (editingMilestone) {
      const idx = updatedMilestones.findIndex(m => m.milestoneId === editingMilestone.milestoneId);
      if (idx !== -1) {
        updatedMilestones[idx] = { ...milestoneForm };
      } else {
        updatedMilestones.push({ ...milestoneForm });
      }
    } else {
      updatedMilestones.push({ ...milestoneForm });
    }

    updatedMilestones.sort((a, b) => a.requiredStamps - b.requiredStamps);
    const updated = { ...loyaltySettings, milestones: updatedMilestones };
    setLoyaltySettings(updated);
    setMilestoneModalOpen(false);
    handleSaveLoyaltySettings(updated);
  };

  const handleDeleteMilestone = (milestoneId) => {
    if (!window.confirm('Are you sure you want to remove this reward offer milestone?')) return;
    const filtered = (loyaltySettings.milestones || []).filter(m => m.milestoneId !== milestoneId);
    const updated = { ...loyaltySettings, milestones: filtered };
    setLoyaltySettings(updated);
    handleSaveLoyaltySettings(updated);
  };

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const query = filter !== 'all' ? `?filter=${filter}` : '';
      const res = await axios.get(`/api/customers${query}`);
      setCustomers(res.data.customers || []);
      if (res.data.stats) setStats(res.data.stats);
    } catch (err) {
      console.error('Failed to load customers:', err);
      toast.error('Failed to load customer directory');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await axios.get(`/api/customers?search=${encodeURIComponent(search)}&filter=${filter}`);
      setCustomers(res.data.customers || []);
      if (res.data.stats) setStats(res.data.stats);
    } catch (err) {
      toast.error('Search failed');
    } finally {
      setLoading(false);
    }
  };

  // Counter staff hand over a free item: marks the reward claimed (customer's phone updates live)
  const [claimingId, setClaimingId] = useState(null);
  const handleClaimReward = async (cust, reward) => {
    if (!window.confirm(`Give ${reward.title} to ${cust.name}?`)) return;
    try {
      setClaimingId(reward._id);
      const res = await axios.post(`/api/customers/${cust._id}/rewards/${reward._id}/claim`);
      toast.success(`🎁 ${reward.title} claimed for ${cust.name}`);
      setSelectedCustomer(res.data.customer);
      loadCustomers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not claim the reward');
    } finally {
      setClaimingId(null);
    }
  };

  const handleQuickAddStamp = async (cust) => {
    try {
      setAddingStampId(cust._id);
      const res = await axios.post('/api/customers/add-stamp', {
        customerId: cust.customerId,
        stampsToAdd: 1
      });

      toast.success(`+1 Stamp added to ${cust.name}! (Total: ${res.data.totalStamps})`);
      loadCustomers();
      if (selectedCustomer && selectedCustomer._id === cust._id) {
        setSelectedCustomer(res.data.customer);
      }
    } catch (err) {
      toast.error('Failed to add stamp');
    } finally {
      setAddingStampId(null);
    }
  };

  const filteredCustomers = customers.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.customerId && c.customerId.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#1A2E22', margin: 0 }}>
            👥 Customer & Loyalty Management
          </h1>
          <p style={{ color: '#5A6E62', fontSize: '0.92rem', marginTop: 4 }}>
            Directory of restaurant customers, table sessions, loyalty stamp cards, and reward wallets.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={loadCustomers}
            style={{
              background: '#FFFFFF',
              color: '#087F45',
              border: '1.5px solid #C7E3D0',
              borderRadius: 12,
              padding: '10px 16px',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer'
            }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Aggregate Statistics Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16,
        marginBottom: 24
      }}>
        <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '18px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
            Total Customers
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#1A2E22', marginTop: 4 }}>
            {stats.totalCustomers}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#087F45', fontWeight: 600, marginTop: 4 }}>
            Registered via Table QR
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '18px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
            Loyalty Stamps Given
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#087F45', marginTop: 4 }}>
            {stats.totalStampsAwarded} 🎯
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, marginTop: 4 }}>
            Across all dine-in visits
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '18px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
            Currently Seated
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#2563EB', marginTop: 4 }}>
            {stats.activeDineInCustomers} 🪑
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, marginTop: 4 }}>
            Active table sessions
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '18px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
            Rewards Unlocked
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#D97706', marginTop: 4 }}>
            {stats.customersWithAvailableRewards} 🎁
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, marginTop: 4 }}>
            Eligible for coffee or discounts
          </div>
        </div>
      </div>

      {/* Main Admin Section Tabs */}
      <div style={{
        display: 'flex',
        gap: 12,
        marginBottom: 20,
        background: '#FFFFFF',
        padding: '8px 12px',
        borderRadius: 16,
        border: '1px solid #E2E8F0'
      }}>
        <button
          onClick={() => setActiveTab('directory')}
          style={{
            padding: '10px 22px',
            borderRadius: 12,
            fontWeight: 800,
            fontSize: '0.92rem',
            border: 'none',
            background: activeTab === 'directory' ? '#087F45' : 'transparent',
            color: activeTab === 'directory' ? '#FFFFFF' : '#475569',
            cursor: 'pointer',
            boxShadow: activeTab === 'directory' ? '0 4px 12px rgba(8,127,69,0.25)' : 'none',
            transition: 'all 0.2s'
          }}
        >
          👥 Customer Directory & Stamps
        </button>

        <button
          onClick={() => {
            setActiveTab('offers');
            loadLoyaltySettings();
          }}
          style={{
            padding: '10px 22px',
            borderRadius: 12,
            fontWeight: 800,
            fontSize: '0.92rem',
            border: 'none',
            background: activeTab === 'offers' ? '#087F45' : 'transparent',
            color: activeTab === 'offers' ? '#FFFFFF' : '#475569',
            cursor: 'pointer',
            boxShadow: activeTab === 'offers' ? '0 4px 12px rgba(8,127,69,0.25)' : 'none',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <span>🎁 Loyalty Program & Reward Offers Settings</span>
          <span style={{
            background: activeTab === 'offers' ? 'rgba(255,255,255,0.25)' : '#E2E8F0',
            padding: '2px 8px',
            borderRadius: 8,
            fontSize: '0.74rem'
          }}>
            ⚙️ Configure
          </span>
        </button>
      </div>

      {/* TAB 1: CUSTOMER DIRECTORY */}
      {activeTab === 'directory' && (
        <>
          {/* Search Bar & Filter Tabs */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: 16,
        padding: '16px 20px',
        border: '1px solid #E2E8F0',
        marginBottom: 20,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, flex: 1, minWidth: 280, maxWidth: 480 }}>
          <input
            type="text"
            className="input-field"
            placeholder="Search by customer name, phone, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ height: 42, fontSize: '0.9rem' }}
          />
          <button
            type="submit"
            style={{
              background: '#087F45',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 10,
              padding: '0 18px',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer'
            }}
          >
            Search
          </button>
        </form>

        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { id: 'all', label: 'All Customers' },
            { id: 'active', label: 'Currently Seated' },
            { id: 'rewards', label: 'Has Unlocked Rewards' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                background: filter === f.id ? '#EBF7EE' : '#FFFFFF',
                color: filter === f.id ? '#087F45' : '#64748B',
                border: filter === f.id ? '1.5px solid #087F45' : '1px solid #E2E8F0',
                borderRadius: 20,
                padding: '6px 14px',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Customer Directory Table */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: 18,
        border: '1px solid #E2E8F0',
        boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
            Loading customers database...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
            <h3 style={{ color: '#1A2E22', fontWeight: 800, marginBottom: 6 }}>No Customers Found</h3>
            <p style={{ fontSize: '0.88rem', color: '#64748B' }}>
              Customers who scan the table QR code will automatically appear here.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#F8FAF8', borderBottom: '1px solid #E2E8F0', color: '#4A5568', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '14px 18px' }}>Customer</th>
                  <th style={{ padding: '14px 18px' }}>Current Table</th>
                  <th style={{ padding: '14px 18px' }}>Loyalty Stamps</th>
                  <th style={{ padding: '14px 18px' }}>Available Rewards</th>
                  <th style={{ padding: '14px 18px' }}>Last Visit</th>
                  <th style={{ padding: '14px 18px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((cust) => {
                  const stampsInCycle = (cust.totalStamps || 0) % 8;
                  const availableRewards = cust.rewards?.filter(r => r.status === 'available') || [];

                  return (
                    <tr
                      key={cust._id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F9FBFA'}
                      onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}
                    >
                      {/* Customer Info */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 38,
                            height: 38,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #087F45 0%, #10B981 100%)',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '1rem',
                            flexShrink: 0
                          }}>
                            {cust.name?.charAt(0)?.toUpperCase() || 'C'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, color: '#1A2E22' }}>
                              {cust.name}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                              📞 {cust.phone} • <span style={{ fontFamily: 'monospace', color: '#087F45', fontWeight: 700 }}>{cust.customerId}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Current Table */}
                      <td style={{ padding: '14px 18px' }}>
                        {cust.activeTable ? (
                          <span style={{
                            background: '#EBF7EE',
                            color: '#087F45',
                            padding: '4px 10px',
                            borderRadius: 20,
                            fontWeight: 800,
                            fontSize: '0.8rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5
                          }}>
                            <span>🪑</span> Table {cust.activeTable}
                          </span>
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: '0.82rem' }}>Offline</span>
                        )}
                      </td>

                      {/* Loyalty Stamps */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 800, color: '#087F45', fontSize: '0.95rem' }}>
                            {stampsInCycle}/8
                          </span>
                          <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                            (Total: {cust.totalStamps || 0})
                          </span>
                        </div>
                        <div style={{ width: 100, height: 6, background: '#E2E8F0', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${(stampsInCycle / 8) * 100}%`, height: '100%', background: '#087F45' }}></div>
                        </div>
                      </td>

                      {/* Available Rewards */}
                      <td style={{ padding: '14px 18px' }}>
                        {availableRewards.length > 0 ? (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {availableRewards.map((r, idx) => (
                              <span
                                key={idx}
                                style={{
                                  background: '#FEF3C7',
                                  color: '#B45309',
                                  padding: '3px 8px',
                                  borderRadius: 12,
                                  fontSize: '0.75rem',
                                  fontWeight: 800
                                }}
                              >
                                🎁 {r.title}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>None ready</span>
                        )}
                      </td>

                      {/* Last Visit */}
                      <td style={{ padding: '14px 18px', color: '#64748B', fontSize: '0.82rem' }}>
                        {cust.lastVisit ? new Date(cust.lastVisit).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : 'Today'}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 8 }}>
                          <button
                            onClick={() => handleQuickAddStamp(cust)}
                            disabled={addingStampId === cust._id}
                            title="Add +1 Stamp"
                            style={{
                              background: '#EBF7EE',
                              color: '#087F45',
                              border: '1px solid #C7E3D0',
                              borderRadius: 8,
                              padding: '5px 10px',
                              fontWeight: 700,
                              fontSize: '0.8rem',
                              cursor: 'pointer'
                            }}
                          >
                            {addingStampId === cust._id ? '...' : '+1 Stamp'}
                          </button>

                          <button
                            onClick={() => setSelectedCustomer(cust)}
                            style={{
                              background: '#FFFFFF',
                              color: '#1A2E22',
                              border: '1px solid #CBD5E1',
                              borderRadius: 8,
                              padding: '5px 12px',
                              fontWeight: 700,
                              fontSize: '0.8rem',
                              cursor: 'pointer'
                            }}
                          >
                            View Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {/* TAB 2: LOYALTY PROGRAM & REWARD OFFERS CONFIGURATION */}
      {activeTab === 'offers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Card Size & Settings Card */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: 20,
            padding: '24px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 2px 10px rgba(0,0,0,0.04)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#1A2E22', margin: '0 0 6px 0' }}>
                  🎯 Loyalty Card Cycle Size
                </h3>
                <p style={{ color: '#64748B', fontSize: '0.88rem', margin: 0, maxWidth: 640 }}>
                  Configure how many stamps are printed on a single loyalty card. Once a customer collects this number of stamps, their card completes, and their very next stamp automatically starts a brand-new card cycle (e.g. Card #2).
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F8FAF8', padding: '10px 16px', borderRadius: 14, border: '1.5px solid #C7E3D0' }}>
                  <span style={{ fontWeight: 800, color: '#1A2E22', fontSize: '0.88rem' }}>
                    Stamps per Card:
                  </span>
                  <input
                    type="number"
                    min="2"
                    max="24"
                    value={loyaltySettings.stampsPerCard || 8}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 8;
                      setLoyaltySettings(prev => ({ ...prev, stampsPerCard: val }));
                    }}
                    style={{
                      width: 65,
                      height: 36,
                      textAlign: 'center',
                      fontWeight: 900,
                      fontSize: '1rem',
                      color: '#087F45',
                      borderRadius: 10,
                      border: '1.5px solid #087F45',
                      background: '#FFFFFF'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F8FAF8', padding: '10px 16px', borderRadius: 14, border: '1.5px solid #C7E3D0' }}>
                  <span style={{ fontWeight: 800, color: '#1A2E22', fontSize: '0.88rem' }}>
                    Min Bill for 1 Stamp (₹):
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    placeholder="200"
                    value={loyaltySettings.minSpendForStamp ?? 200}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 0;
                      setLoyaltySettings(prev => ({ ...prev, minSpendForStamp: val }));
                    }}
                    style={{
                      width: 85,
                      height: 36,
                      textAlign: 'center',
                      fontWeight: 900,
                      fontSize: '1rem',
                      color: '#087F45',
                      borderRadius: 10,
                      border: '1.5px solid #087F45',
                      background: '#FFFFFF'
                    }}
                  />
                  <button
                    onClick={() => handleSaveLoyaltySettings()}
                    disabled={savingLoyalty}
                    style={{
                      background: '#087F45',
                      color: '#FFFFFF',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: 10,
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {savingLoyalty ? 'Saving...' : '💾 Save Settings'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Reward Milestones Manager */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: 20,
            padding: '24px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 2px 10px rgba(0,0,0,0.04)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#1A2E22', margin: '0 0 4px 0' }}>
                  🎁 Configured Reward Offers & Milestones
                </h3>
                <p style={{ color: '#64748B', fontSize: '0.88rem', margin: 0 }}>
                  Define at which stamp milestone the customer gets an offer, and choose whether it is a complimentary free item or a bill discount.
                </p>
              </div>

              <button
                onClick={() => openMilestoneModal(null)}
                style={{
                  background: 'linear-gradient(135deg, #087F45 0%, #055C31 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 12,
                  padding: '10px 18px',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 14px rgba(8, 127, 69, 0.25)'
                }}
              >
                <span>➕</span>
                <span>Add Reward Milestone</span>
              </button>
            </div>

            {loadingLoyalty ? (
              <div style={{ textAlign: 'center', padding: '36px', color: '#64748B' }}>
                Loading loyalty milestones...
              </div>
            ) : loyaltySettings.milestones && loyaltySettings.milestones.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                {loyaltySettings.milestones.map((m) => (
                  <div
                    key={m.milestoneId}
                    style={{
                      background: '#F8FAF8',
                      borderRadius: 16,
                      padding: '18px 20px',
                      border: '1.5px solid #E2E8F0',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 14
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 32 }}>{m.icon || '🎁'}</span>
                          <div>
                            <div style={{ fontWeight: 900, color: '#1A2E22', fontSize: '1.05rem' }}>
                              {m.title}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: 2 }}>
                              {m.description || 'Customer reward milestone'}
                            </div>
                          </div>
                        </div>

                        <span style={{
                          background: '#EBF7EE',
                          color: '#087F45',
                          fontWeight: 900,
                          fontSize: '0.82rem',
                          padding: '4px 12px',
                          borderRadius: 20,
                          border: '1px solid #C7E3D0',
                          whiteSpace: 'nowrap'
                        }}>
                          🎯 At {m.requiredStamps} Stamps
                        </span>
                      </div>

                      {/* Reward Type Tag */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          padding: '3px 10px',
                          borderRadius: 8,
                          background: m.rewardType === 'free_item' ? '#DCFCE7' : m.rewardType === 'discount_percent' ? '#DBEAFE' : '#FEF3C7',
                          color: m.rewardType === 'free_item' ? '#166534' : m.rewardType === 'discount_percent' ? '#1E40AF' : '#92400E'
                        }}>
                          {m.rewardType === 'free_item'
                            ? '☕ Complimentary Free Item (₹0 cut from bill)'
                            : m.rewardType === 'discount_percent'
                            ? `🏷️ ${m.rewardValue}% OFF on Food Bill`
                            : `💵 Flat ₹${m.rewardValue} OFF on Total`}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
                      <button
                        onClick={() => openMilestoneModal(m)}
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid #CBD5E1',
                          borderRadius: 8,
                          padding: '6px 12px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: '#334155',
                          cursor: 'pointer'
                        }}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => handleDeleteMilestone(m.milestoneId)}
                        style={{
                          background: '#FEE2E2',
                          border: 'none',
                          borderRadius: 8,
                          padding: '6px 12px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: '#B91C1C',
                          cursor: 'pointer'
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '36px', background: '#F8FAF8', borderRadius: 16 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🎁</div>
                <div style={{ fontWeight: 800, color: '#1A2E22', fontSize: '1rem', marginBottom: 4 }}>
                  No Reward Milestones Configured Yet
                </div>
                <p style={{ color: '#64748B', fontSize: '0.85rem', marginBottom: 14 }}>
                  Add your first milestone offer (e.g. Free Coffee at 4 stamps, 20% OFF at 8 stamps).
                </p>
                <button
                  onClick={() => openMilestoneModal(null)}
                  style={{
                    background: '#087F45',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 10,
                    padding: '8px 18px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  + Add First Milestone
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT REWARD MILESTONE */}
      {milestoneModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 22,
            width: '100%',
            maxWidth: 480,
            padding: 24,
            boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#1A2E22', margin: 0 }}>
                {editingMilestone ? '✏️ Edit Reward Milestone' : '➕ Add New Reward Milestone'}
              </h3>
              <button
                onClick={() => setMilestoneModalOpen(false)}
                style={{
                  background: '#F1F5F9',
                  border: 'none',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontWeight: 800
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMilestoneForm} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Required Stamps */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Required Stamps (At which stamp does the customer get this offer?)
                </label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  required
                  value={milestoneForm.requiredStamps}
                  onChange={(e) => setMilestoneForm(prev => ({ ...prev, requiredStamps: parseInt(e.target.value, 10) || 1 }))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.92rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Reward Title */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Reward Offer Title (e.g. Free Coffee, Free Dessert)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Free Artisan Coffee"
                  value={milestoneForm.title}
                  onChange={(e) => setMilestoneForm(prev => ({ ...prev, title: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.92rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Reward Type: rewards are free food / drink items handed over at the counter */}
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '10px 12px', fontSize: '0.85rem', color: '#166534', fontWeight: 600 }}>
                ☕ Free item reward: staff hand it over at the counter when the customer claims it.
              </div>

              {/* Description */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Description (shown to customer)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Get a complimentary freshly brewed espresso or cappuccino"
                  value={milestoneForm.description}
                  onChange={(e) => setMilestoneForm(prev => ({ ...prev, description: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.92rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Icon Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Display Icon
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['☕', '🏷️', '🎁', '🍰', '🍕', '🍹', '🍔', '🍨', '🥗'].map(ic => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setMilestoneForm(prev => ({ ...prev, icon: ic }))}
                      style={{
                        fontSize: 22,
                        width: 42,
                        height: 42,
                        borderRadius: 10,
                        border: milestoneForm.icon === ic ? '2px solid #087F45' : '1px solid #CBD5E1',
                        background: milestoneForm.icon === ic ? '#EBF7EE' : '#FFFFFF',
                        cursor: 'pointer'
                      }}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button
                  type="submit"
                  disabled={savingLoyalty}
                  style={{
                    flex: 1,
                    background: '#087F45',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 12,
                    padding: '12px',
                    fontWeight: 800,
                    fontSize: '0.92rem',
                    cursor: 'pointer'
                  }}
                >
                  {savingLoyalty ? 'Saving...' : 'Save Milestone'}
                </button>
                <button
                  type="button"
                  onClick={() => setMilestoneModalOpen(false)}
                  style={{
                    background: '#F1F5F9',
                    color: '#475569',
                    border: 'none',
                    borderRadius: 12,
                    padding: '12px 18px',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Details & Reward QR Modal */}
      {selectedCustomer && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 22,
            width: '100%',
            maxWidth: 520,
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: 24,
            boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#087F45', fontWeight: 800, textTransform: 'uppercase' }}>
                  Customer Profile
                </span>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#1A2E22', margin: 0 }}>
                  {selectedCustomer.name}
                </h3>
                <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: 2 }}>
                  📞 {selectedCustomer.phone} • ID: <strong style={{ color: '#087F45' }}>{selectedCustomer.customerId}</strong>
                </div>
              </div>

              <button
                onClick={() => setSelectedCustomer(null)}
                style={{
                  background: '#F1F5F9',
                  border: 'none',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontWeight: 800
                }}
              >
                ✕
              </button>
            </div>

            {/* Stamps and rewards status */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 800, color: '#1A2E22', fontSize: '0.92rem' }}>Loyalty Stamp Progress</span>
                <span style={{ fontWeight: 800, color: '#087F45' }}>{selectedCustomer.totalStamps || 0} Total Stamps</span>
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(s => {
                  const isEarned = ((selectedCustomer.totalStamps || 0) % 8) >= s;
                  return (
                    <div
                      key={s}
                      style={{
                        flex: 1,
                        height: 36,
                        borderRadius: 8,
                        background: isEarned ? '#087F45' : '#F1F5F9',
                        color: isEarned ? '#FFFFFF' : '#64748B',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '0.8rem'
                      }}
                    >
                      {isEarned ? '✓' : s}
                    </div>
                  );
                })}
              </div>

              {/* Rewards Wallet list */}
              <div style={{ background: '#F8FAF8', borderRadius: 12, padding: 12, border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', marginBottom: 8 }}>
                  Rewards Wallet Status
                </div>
                {selectedCustomer.rewards?.map((r, i) => (
                  <div key={r._id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: '0.85rem', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600 }}>
                      🎁 {r.title}
                      <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 500 }}>
                        {r.status === 'redeemed' && r.redeemedAt
                          ? `Claimed ${new Date(r.redeemedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                          : `At ${r.requiredStamps} stamps`}
                      </span>
                    </span>
                    {r.status === 'available' ? (
                      <button
                        onClick={() => handleClaimReward(selectedCustomer, r)}
                        disabled={claimingId === r._id}
                        style={{
                          background: '#087F45', color: '#FFFFFF', border: 'none', borderRadius: 10,
                          padding: '6px 12px', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap'
                        }}
                      >
                        {claimingId === r._id ? 'Claiming…' : '🎁 Claim'}
                      </button>
                    ) : (
                      <span style={{
                        fontWeight: 800,
                        fontSize: '0.74rem',
                        textTransform: 'uppercase',
                        color: r.status === 'redeemed' ? '#1E40AF' : '#64748B',
                        background: r.status === 'redeemed' ? '#DBEAFE' : '#E2E8F0',
                        padding: '2px 8px',
                        borderRadius: 10,
                        whiteSpace: 'nowrap'
                      }}>
                        {r.status === 'redeemed' ? '✓ Claimed' : '🔒 Locked'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions in modal */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => handleQuickAddStamp(selectedCustomer)}
                style={{
                  flex: 1,
                  background: '#087F45',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                + Add Loyalty Stamp
              </button>

              <button
                onClick={() => setSelectedCustomer(null)}
                style={{
                  background: '#F1F5F9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px 20px',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

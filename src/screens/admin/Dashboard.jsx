'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

import { useNavigate } from '@/lib/router';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [tables, setTables] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, tablesRes, ordersRes, monthlyRes] = await Promise.all([
          axios.get('/api/reports/dashboard'),
          axios.get('/api/tables'),
          axios.get('/api/orders?active=true'),
          axios.get(`/api/reports/monthly?year=${new Date().getFullYear()}`)
        ]);
        setStats(statsRes.data);
        setTables(tablesRes.data);
        setRecentOrders(ordersRes.data.slice(0, 8));
        setMonthly(monthlyRes.data.monthlyData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="loading-center"><div className="spinner"></div></div>;

  const available = tables.filter(t => t.status === 'available').length;
  const occupied = tables.filter(t => t.status === 'occupied').length;

  const statusColor = {
    pending: 'badge-orange', accepted: 'badge-blue', preparing: 'badge-purple',
    ready: 'badge-green', served: 'badge-green', completed: 'badge-gray', cancelled: 'badge-red'
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <span className="text-sm text-muted">📅 {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => navigate('/admin/takeaway')}
          style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          🛍️ Takeaway Order
        </button>
      </div>
      <div className="page-body">
        {/* Stats */}
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-icon orange">💰</div>
            <div>
              <div className="stat-value">₹{(stats?.todayRevenue || 0).toLocaleString()}</div>
              <div className="stat-label">Today's Revenue</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon blue">📋</div>
            <div>
              <div className="stat-value">{stats?.todayOrders || 0}</div>
              <div className="stat-label">Today's Orders</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green">🟢</div>
            <div>
              <div className="stat-value">{available}</div>
              <div className="stat-label">Available Tables</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon red">🔴</div>
            <div>
              <div className="stat-value">{occupied}</div>
              <div className="stat-label">Occupied Tables</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon purple">⏳</div>
            <div>
              <div className="stat-value">{stats?.pendingOrders || 0}</div>
              <div className="stat-label">Pending Orders</div>
            </div>
          </div>
        </div>

        <div className="grid-2" style={{ gap: 24 }}>
          {/* Chart */}
          <div className="card">
            <h3 style={{ marginBottom: 20, fontSize: '1rem', fontFamily: 'Inter', fontWeight: 700 }}>Monthly Revenue ({new Date().getFullYear()})</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={m => m.slice(0, 3)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={v => [`₹${v.toLocaleString()}`, 'Revenue']} />
                <Line type="monotone" dataKey="revenue" stroke="#FF6B35" strokeWidth={2.5} dot={{ r: 4, fill: '#FF6B35' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Table status */}
          <div className="card">
            <h3 style={{ marginBottom: 16, fontSize: '1rem', fontFamily: 'Inter', fontWeight: 700 }}>Table Status</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
              {tables.map(t => (
                <div key={t._id} style={{
                  padding: '10px 6px', borderRadius: 8, textAlign: 'center', fontSize: 13, fontWeight: 600,
                  background: t.status === 'available' ? '#f0fff4' : t.status === 'occupied' ? '#fff3ee' : '#fffaf0',
                  color: t.status === 'available' ? '#276749' : t.status === 'occupied' ? '#c05621' : '#744210',
                  border: `1.5px solid ${t.status === 'available' ? '#9ae6b4' : t.status === 'occupied' ? '#fbd38d' : '#faf089'}`
                }}>
                  T{t.tableNumber}
                  <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2 }}>{t.status}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent orders */}
        <div className="card mt-24">
          <div className="flex-between mb-16">
            <h3 style={{ fontSize: '1rem', fontFamily: 'Inter', fontWeight: 700 }}>Active Orders</h3>
            <span className="text-sm text-muted">{recentOrders.length} orders</span>
          </div>
          {recentOrders.length === 0 ? (
            <div className="empty-state"><div className="icon">📋</div><p>No active orders</p></div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Order #</th><th>Table</th><th>Items</th><th>Amount</th><th>Status</th><th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map(o => (
                    <tr key={o._id}>
                      <td><strong>#{o.orderNumber}</strong></td>
                      <td>
                        {o.orderType === 'takeaway' ? (
                          <span className="badge" style={{ background: '#FAF5FF', color: '#6B46C1', border: '1px solid #D6BCFA', fontSize: 11, fontWeight: 700 }}>
                            🛍️ Parcel {o.takeawayToken ? `(${o.takeawayToken})` : ''}
                          </span>
                        ) : (
                          `Table ${o.tableNumber}`
                        )}
                      </td>
                      <td>{o.items.length} items</td>
                      <td><strong>₹{o.totalAmount}</strong></td>
                      <td><span className={`badge ${statusColor[o.status] || 'badge-gray'}`}>{o.status}</span></td>
                      <td className="text-sm text-muted">{new Date(o.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

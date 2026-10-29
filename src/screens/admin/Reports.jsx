'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const PAYMENT_COLORS = { CASH: '#38a169', UPI: '#3182ce', CARD: '#805ad5' };
import { useAuth } from '../../context/AuthContext';

export default function Reports() {
  const { restaurant } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [tab, setTab] = useState('daily');
  const [daily, setDaily] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (tab === 'daily') {
      axios.get(`/api/reports/daily?date=${date}`).then(r => setDaily(r.data));
    } else {
      axios.get(`/api/reports/monthly?year=${year}`).then(r => setMonthly(r.data));
    }
  }, [tab, date, year]);

  // How the day's bills were paid (set per bill from Orders → payment button)
  const payments = daily ? ['cash', 'upi', 'card'].map(mode => ({
    name: mode.toUpperCase(),
    value: Number(daily.paymentBreakdown?.[mode] || 0),
    bills: (daily.bills || []).filter(b => b.paymentMode === mode).length,
  })) : [];
  const pieData = payments.filter(p => p.value > 0);

  // Excel download of the report on screen (daily: summary, bill-wise, item-wise; monthly: month-wise, day-wise)
  const downloadExcel = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const excel = await import('@/lib/reportExcel');
      if (tab === 'daily') {
        if (!daily) return;
        await excel.downloadDailyReport(daily, date, restaurant);
      } else {
        if (!monthly) return;
        const res = await axios.get(`/api/reports/daywise?year=${year}`);
        await excel.downloadMonthlyReport(monthly, res.data.days || [], year, restaurant);
      }
      toast.success('Report downloaded');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Could not create the Excel report');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Reports & Analytics</h1>
        <div className="flex-gap">
          <button className={`btn btn-sm ${tab === 'daily' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('daily')}>Daily</button>
          <button className={`btn btn-sm ${tab === 'monthly' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('monthly')}>Monthly</button>
          <button className="btn btn-sm btn-success" onClick={downloadExcel}
            disabled={downloading || (tab === 'daily' ? !daily : !monthly)}>
            {downloading ? 'Preparing…' : '⬇️ Download Excel'}
          </button>
        </div>
      </div>
      <div className="page-body">
        {tab === 'daily' && (
          <div>
            <div className="card mb-16">
              <div className="flex-gap">
                <label className="form-label" style={{ margin: 0 }}>Select Date:</label>
                <input type="date" className="form-input" style={{ width: 200 }} value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>
            {daily && (
              <>
                <div className="stat-grid">
                  <div className="stat-card">
                    <div className="stat-icon orange">💰</div>
                    <div><div className="stat-value">₹{(daily.totalRevenue || 0).toLocaleString()}</div><div className="stat-label">Total Revenue</div></div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon blue">📋</div>
                    <div><div className="stat-value">{daily.totalOrders}</div><div className="stat-label">Total Orders</div></div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon green">✅</div>
                    <div><div className="stat-value">{daily.completedOrders}</div><div className="stat-label">Completed</div></div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon purple">🏆</div>
                    <div>
                      <div className="stat-value" style={{ fontSize: '1.1rem' }}>{daily.topItems?.[0]?.name || '-'}</div>
                      <div className="stat-label">Top Selling Item</div>
                    </div>
                  </div>
                </div>

                <div className="grid-2" style={{ gap: 24 }}>
                  <div className="card">
                    <h3 style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '1rem', marginBottom: 16 }}>Top 5 Items</h3>
                    {daily.topItems?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={daily.topItems}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="quantity" fill="#FF6B35" radius={[4, 4, 0, 0]} name="Qty Sold" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <div className="empty-state" style={{ padding: 30 }}><p>No data</p></div>}
                  </div>

                  <div className="card">
                    <h3 style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '1rem', marginBottom: 16 }}>Payment Breakdown</h3>
                    {pieData.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={180}>
                          <PieChart>
                            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ₹${value}`}>
                              {pieData.map(p => <Cell key={p.name} fill={PAYMENT_COLORS[p.name]} />)}
                            </Pie>
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                          {payments.map(p => (
                            <div key={p.name} style={{ flex: 1, textAlign: 'center', background: '#F7FAFC', borderRadius: 8, padding: '8px 4px', borderTop: `3px solid ${PAYMENT_COLORS[p.name]}` }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#718096' }}>{p.name}</div>
                              <div style={{ fontWeight: 800 }}>₹{p.value.toLocaleString()}</div>
                              <div style={{ fontSize: 11, color: '#718096' }}>{p.bills} bill{p.bills === 1 ? '' : 's'}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : <div className="empty-state" style={{ padding: 30 }}><p>No payment data</p></div>}
                  </div>
                </div>

                {daily.bills?.length > 0 && (
                  <div className="card mt-24">
                    <h3 style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '1rem', marginBottom: 14 }}>Bills for {date}</h3>
                    <div className="table-wrapper">
                      <table>
                        <thead><tr><th>Bill #</th><th>Order #</th><th>Table</th><th>Total</th><th>Payment</th><th>Time</th></tr></thead>
                        <tbody>
                          {daily.bills.map(b => (
                            <tr key={b._id}>
                              <td><strong>#{b.billNumber}</strong></td>
                              <td>#{b.orderNumber}</td>
                              <td>T{b.tableNumber}</td>
                              <td><strong style={{ color: '#FF6B35' }}>₹{b.totalAmount}</strong></td>
                              <td><span className="badge badge-green" style={{ textTransform: 'uppercase' }}>{b.paymentMode}</span></td>
                              <td className="text-sm text-muted">{new Date(b.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'monthly' && monthly && (
          <div>
            <div className="card mb-16">
              <div className="flex-gap">
                <label className="form-label" style={{ margin: 0 }}>Year:</label>
                <select className="form-select" style={{ width: 120 }} value={year} onChange={e => setYear(e.target.value)}>
                  {[2023, 2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div className="card mb-24">
              <h3 style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '1rem', marginBottom: 16 }}>Monthly Revenue — {year}</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthly.monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={m => m.slice(0, 3)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => [`₹${v.toLocaleString()}`, 'Revenue']} />
                  <Bar dataKey="revenue" fill="#FF6B35" radius={[4, 4, 0, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Month</th><th>Orders</th><th>Revenue</th><th>Avg per Order</th></tr></thead>
                <tbody>
                  {monthly.monthlyData.map((m, i) => (
                    <tr key={i}>
                      <td><strong>{m.month}</strong></td>
                      <td>{m.orders}</td>
                      <td><strong style={{ color: '#FF6B35' }}>₹{m.revenue.toLocaleString()}</strong></td>
                      <td>{m.orders > 0 ? `₹${Math.round(m.revenue / m.orders)}` : '-'}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#fff3ee', fontWeight: 700 }}>
                    <td>TOTAL</td>
                    <td>{monthly.monthlyData.reduce((s, m) => s + m.orders, 0)}</td>
                    <td style={{ color: '#FF6B35' }}>₹{monthly.monthlyData.reduce((s, m) => s + m.revenue, 0).toLocaleString()}</td>
                    <td>-</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function KitchenCompleted() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const res = await axios.get('/api/orders?status=completed');
      setOrders(res.data.slice(0, 50));
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="loading-center"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="page-header" style={{ background: '#1A202C', color: 'white', borderBottom: '1px solid #2D3748' }}>
        <h1 style={{ color: 'white' }}>✅ Completed Orders</h1>
        <span style={{ color: '#718096', fontSize: 13 }}>Last 50 completed</span>
      </div>
      <div className="page-body">
        {orders.length === 0 ? (
          <div className="empty-state card"><div className="icon">📋</div><p>No completed orders yet</p></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {orders.map(o => (
              <div key={o._id} style={{ background: 'white', borderRadius: 10, padding: 16, border: '1.5px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <strong style={{ fontSize: 14 }}>Order #{o.orderNumber}</strong>
                  <span style={{ fontSize: 12, color: '#718096' }}>
                    {o.orderType === 'takeaway' ? (
                      <span className="badge" style={{ background: '#FAF5FF', color: '#6B46C1', border: '1px solid #D6BCFA', fontSize: 11, fontWeight: 700 }}>
                        🛍️ Parcel {o.takeawayToken ? `(${o.takeawayToken})` : ''}
                      </span>
                    ) : (
                      `T${o.tableNumber}`
                    )}
                  </span>
                </div>
                {o.items.map((item, i) => (
                  <div key={i} style={{ fontSize: 13, color: '#4a5568', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{item.name}</span><span style={{ fontWeight: 600 }}>×{item.quantity}</span>
                  </div>
                ))}
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ background: '#f0fff4', color: '#276749', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>✅ Completed</span>
                  <span style={{ fontSize: 11, color: '#718096' }}>{new Date(o.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

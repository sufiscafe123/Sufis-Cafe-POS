'use client';

import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import BillComposer from '../../components/billing/BillComposer';
import BillReceipt from '../../components/billing/BillReceipt';
import BillableOrderList from '../../components/billing/BillableOrderList';
import { printReceipt, receiptText, paymentIcon, receiptBillNo } from '../../components/billing/receipt';

const actionBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '5px 10px', borderRadius: 6, border: '1.5px solid #E2E8F0',
  background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600,
  color: '#2D3748', whiteSpace: 'nowrap'
};

export default function Billing() {
  const { restaurant } = useAuth();
  const socket = useSocket();
  const [orders, setOrders] = useState([]);
  const [bills, setBills] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [lastBill, setLastBill] = useState(null);
  const [tab, setTab] = useState('generate');

  const loadOrders = useCallback(async () => {
    try {
      const res = await axios.get('/api/orders?active=true');
      // Orders still waiting for a waiter's Accept can't be billed yet
      const billable = res.data.filter(o => o.status !== 'awaiting');
      setOrders(billable);
      setSelectedOrder(prev => (prev ? billable.find(o => o._id === prev._id) || null : prev));
    } catch {
      toast.error('Could not load orders');
    }
  }, []);

  const loadBills = useCallback(async () => {
    try {
      const res = await axios.get('/api/bills');
      setBills(res.data);
    } catch {
      toast.error('Could not load bills');
    }
  }, []);

  useEffect(() => { loadOrders(); loadBills(); }, [loadOrders, loadBills]);

  useEffect(() => {
    if (!socket) return;
    const orderEvents = ['order-created', 'order-updated', 'order-status-updated', 'bill-requested'];
    const onBill = () => { loadOrders(); loadBills(); };
    orderEvents.forEach(ev => socket.on(ev, loadOrders));
    socket.on('bill-created', onBill);
    return () => {
      orderEvents.forEach(ev => socket.off(ev, loadOrders));
      socket.off('bill-created', onBill);
    };
  }, [socket, loadOrders, loadBills]);

  const handleBilled = (bill) => {
    setLastBill(bill);
    setSelectedOrder(null);
    loadOrders();
    loadBills();
  };

  const downloadBill = (b) => {
    const blob = new Blob([receiptText(b, restaurant)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bill_${receiptBillNo(b)}_${String(b.createdAt).slice(0, 10)}_${b.orderType === 'takeaway' ? 'Takeaway' : `T${b.tableNumber}`}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Bill No ${receiptBillNo(b)} downloaded`);
  };

  // Hide the GST column when GST is 0% and none of the listed bills carry GST
  const showGst = (restaurant?.gstRate ?? 5) > 0 || bills.some(b => b.gstAmount > 0);

  return (
    <div>
      <div className="page-header">
        <h1>Billing</h1>
        <div className="flex-gap">
          <button className={`btn btn-sm ${tab === 'generate' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('generate')}>Generate Bill</button>
          <button className={`btn btn-sm ${tab === 'history' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('history')}>Bill History</button>
        </div>
      </div>

      <div className="page-body">
        {tab === 'generate' && (
          <div className="grid-2" style={{ gap: 24, alignItems: 'start' }}>
            <div>
              <h3 style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '1rem', marginBottom: 14 }}>Select Order / Parcel</h3>
              <BillableOrderList
                orders={orders}
                selectedId={selectedOrder?._id}
                onSelect={(o) => { setSelectedOrder(o); setLastBill(null); }}
              />
            </div>

            <div>
              {selectedOrder ? (
                <BillComposer key={selectedOrder._id} order={selectedOrder} onBilled={handleBilled} />
              ) : lastBill ? (
                <BillReceipt bill={lastBill} />
              ) : (
                <div className="empty-state card">
                  <div className="icon">🧾</div>
                  <p>Select an order to see the bill</p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>BILL NO</th>
                  <th>ORDER #</th>
                  <th>TYPE / TABLE</th>
                  <th>CUSTOMER</th>
                  <th>SUBTOTAL</th>
                  <th>DISCOUNT</th>
                  {showGst && <th>GST</th>}
                  <th>TOTAL</th>
                  <th>PAYMENT</th>
                  <th>DATE & TIME</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {bills.length === 0 && (
                  <tr>
                    <td colSpan={showGst ? 11 : 10} className="text-center text-muted" style={{ padding: 40 }}>No bills found</td>
                  </tr>
                )}
                {bills.map(b => (
                  <tr key={b._id}>
                    <td>
                      <strong>{receiptBillNo(b)}</strong>
                      {b.dailyBillNumber != null && <div style={{ fontSize: 11, color: '#718096' }}>#{b.billNumber}</div>}
                    </td>
                    <td>#{b.orderNumber}</td>
                    <td>
                      {b.orderType === 'takeaway' ? (
                        <span className="badge" style={{ background: '#FAF5FF', color: '#6B46C1', border: '1px solid #D6BCFA', fontWeight: 700 }}>
                          🛍️ Parcel {b.takeawayToken ? `(${b.takeawayToken})` : ''}
                        </span>
                      ) : (
                        <span className="badge" style={{ background: '#EBF8FF', color: '#2B6CB0', border: '1px solid #BEE3F8' }}>
                          🪑 T{b.tableNumber}
                        </span>
                      )}
                    </td>
                    <td className="text-sm">
                      {b.customerName ? (
                        <div>
                          <strong>{b.customerName}</strong>
                          {b.customerPhone && <div style={{ fontSize: 11, color: '#718096' }}>{b.customerPhone}</div>}
                        </div>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td>₹{b.subtotal}</td>
                    <td>{b.discountAmount > 0 ? `-₹${b.discountAmount}` : '-'}</td>
                    {showGst && <td>₹{b.gstAmount}</td>}
                    <td><strong style={{ color: '#FF6B35' }}>₹{b.totalAmount}</strong></td>
                    <td>
                      <span className={`badge ${b.paymentMode === 'cash' ? 'badge-green' : b.paymentMode === 'upi' ? 'badge-blue' : 'badge-purple'}`}>
                        {paymentIcon(b.paymentMode)} {b.paymentMode}
                      </span>
                    </td>
                    <td className="text-sm text-muted">
                      {new Date(b.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <div className="flex-gap" style={{ gap: 6 }}>
                        <button onClick={() => printReceipt(b, restaurant)} title="Print Bill" style={actionBtn}>🖨️ Print</button>
                        <button onClick={() => downloadBill(b)} title="Download Bill" style={actionBtn}>⬇️ Download</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

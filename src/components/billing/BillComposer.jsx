'use client';

import React, { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { computeTotals, printReceipt, receiptBillNo } from './receipt';
import { BillPaper } from './BillReceipt';

/**
 * Right-hand billing panel: the bill exactly as it will print, and one "Generate & Print Bill" button.
 * Payment is collected at the counter; the bill records the customer's stated
 * preference (from "Call for Bill") or cash.
 */
export default function BillComposer({ order, onBilled }) {
  const { restaurant } = useAuth();
  const gstRate = restaurant?.gstRate ?? 5;
  const [generating, setGenerating] = useState(false);

  const totals = computeTotals(order.totalAmount, gstRate, 0);

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    // Open the print window now, while the click is still a user action, so pop-up blockers allow it
    const printWindow = window.open('', '_blank', 'width=420,height=750');
    printWindow?.document.write('<p style="font-family:Arial;padding:20px">Preparing bill…</p>');
    try {
      const res = await axios.post('/api/bills', { orderId: order._id, paymentMode: order.paymentPreference || 'cash' });
      const bill = res.data;
      toast.success(`Bill No ${receiptBillNo(bill)} generated`);
      printReceipt(bill, restaurant, printWindow);
      onBilled(bill);
    } catch (err) {
      printWindow?.close();
      toast.error(err.response?.data?.message || 'Error generating bill');
      setGenerating(false);
    }
  };

  // The bill as it will print; the Bill No is assigned when it is generated
  const draftBill = {
    orderNumber: order.orderNumber,
    orderType: order.orderType === 'takeaway' ? 'takeaway' : 'dine_in',
    tableNumber: order.tableNumber,
    takeawayToken: order.takeawayToken,
    createdAt: new Date().toISOString(),
    items: order.items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, total: i.price * i.quantity })),
    subtotal: totals.subtotal,
    discountAmount: 0,
    gstRate,
    gstAmount: totals.gstAmount,
    totalAmount: totals.totalAmount,
  };

  return (
    <div>
      {order.billRequested && (
        <div style={{ background: '#FFFBEB', border: '1px solid #F6AD55', color: '#92400E', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
          🙋 Customer asked for the bill
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <BillPaper bill={draftBill} />
      </div>

      <div className="card">
        <button className="btn btn-success w-full btn-lg" onClick={generate} disabled={generating}>
          {generating ? 'Generating…' : `🧾 Generate & Print Bill — ₹${totals.totalAmount}`}
        </button>
        <p className="text-sm text-muted" style={{ marginTop: 8, textAlign: 'center' }}>
          Generate the bill only after collecting the payment.
        </p>
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { groupBillItems, printReceipt, receiptBillNo } from './receipt';

const fmtDate = (d) => {
  const parts = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).formatToParts(new Date(d));
  const get = (t) => parts.find(p => p.type === t)?.value || '';
  return `${get('day')}-${get('month')}-${get('year')}`;
};
const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

const mono = { fontSize: 13 };
const dashed = { borderTop: '1px dashed #4A5568', margin: '10px 0' };
const double = { borderTop: '3px double #4A5568', margin: '8px 0' };
const cell = { textAlign: 'right', padding: '2px 0' };

// The bill exactly as it prints. Used for the live bill before generating (no Bill No yet)
// and for the generated bill afterwards.
export function BillPaper({ bill, children }) {
  const { restaurant } = useAuth();
  const half = (bill.gstAmount || 0) / 2;
  // GST set to 0% in Settings: no CGST/SGST lines (the GSTIN still prints when one is saved)
  const hasGst = (bill.gstRate || 0) > 0;
  const isTakeaway = bill.orderType === 'takeaway';
  const lines = groupBillItems(bill.items);
  const qty = lines.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

  return (
    <div className="bill-paper">
      <div className="bill-header">
        <h2 style={{ textTransform: 'uppercase' }}>{restaurant?.name || 'Restaurant'}</h2>
        {restaurant?.address && <p style={{ fontSize: 12, color: '#4A5568' }}>{restaurant.address}</p>}
        {restaurant?.phone && <p style={{ fontSize: 12, color: '#4A5568' }}>Phone : {restaurant.phone}</p>}
        {restaurant?.gstNumber && <p style={{ fontSize: 12, color: '#4A5568' }}>GSTNo.: {restaurant.gstNumber}</p>}
      </div>
      <div style={dashed} />
      <div className="bill-row" style={mono}>
        <span>Bill No : <strong>{receiptBillNo(bill) ?? '—'}</strong></span>
        <span>Date : {fmtDate(bill.createdAt)}</span>
      </div>
      <div className="bill-row" style={mono}>
        <span>{isTakeaway ? `Parcel : ${bill.takeawayToken || `#${bill.orderNumber}`}` : `Table No : ${bill.tableNumber}`}</span>
        <span>Time : {new Date(bill.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div style={double} />
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', fontWeight: 600 }}>DESCRIPTION</th>
            <th style={{ ...cell, fontWeight: 600, width: 40 }}>QTY</th>
            <th style={{ ...cell, fontWeight: 600, width: 56 }}>RATE</th>
            <th style={{ ...cell, fontWeight: 600, width: 76 }}>AMOUNT</th>
          </tr>
          <tr><td colSpan={4}><div style={double} /></td></tr>
        </thead>
        <tbody>
          {lines.map((item, i) => (
            <tr key={i}>
              <td style={{ textTransform: 'uppercase', padding: '2px 4px 2px 0' }}>{item.name}</td>
              <td style={cell}>{item.quantity}</td>
              <td style={cell}>{item.price}</td>
              <td style={cell}>{money(item.total)}</td>
            </tr>
          ))}
          <tr><td colSpan={4}><div style={dashed} /></td></tr>
          <tr style={{ fontWeight: 700 }}>
            <td>Total</td><td style={cell}>{qty}</td><td /><td style={cell}>{money(bill.subtotal)}</td>
          </tr>
        </tbody>
      </table>
      {bill.discountAmount > 0 && (
        <div className="bill-row text-sm" style={{ color: '#276749' }}>
          <span>Discount{bill.appliedReward?.title ? ` (${bill.appliedReward.title})` : ''}</span><span>-{money(bill.discountAmount)}</span>
        </div>
      )}
      {hasGst && (
        <>
          <div className="bill-row text-sm"><span>CGST @ {(bill.gstRate || 0) / 2}%</span><span>{money(half)}</span></div>
          <div className="bill-row text-sm"><span>SGST @ {(bill.gstRate || 0) / 2}%</span><span>{money(half)}</span></div>
        </>
      )}
      <div style={dashed} />
      <div className="bill-row" style={{ fontSize: '1.15rem', fontWeight: 800 }}>
        <span>Net Payable</span><span style={{ color: '#FF6B35' }}>₹{money(bill.totalAmount)}</span>
      </div>
      <div style={double} />
      <div className="bill-row" style={{ fontSize: 12, color: '#4A5568' }}>
        <span>E. &amp; O. E.</span><span>{restaurant?.receiptFooter || 'Thanks... Visit Again...'}</span>
      </div>
      {children}
    </div>
  );
}

// A generated bill with a reprint button.
export default function BillReceipt({ bill }) {
  const { restaurant } = useAuth();
  return (
    <BillPaper bill={bill}>
      <button className="btn btn-primary w-full" style={{ marginTop: 16 }} onClick={() => printReceipt(bill, restaurant)}>
        🖨️ Print Again
      </button>
    </BillPaper>
  );
}

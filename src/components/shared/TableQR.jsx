'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import QRCode from 'qrcode';
import { escapeHtml } from '../billing/receipt';

// Address the table QR codes open. Set NEXT_PUBLIC_APP_URL to the live site (e.g. the Vercel
// domain) so printed codes keep working; otherwise the address this page is open on is used.
export function appBaseUrl() {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
  return configured || window.location.origin;
}

// Scanning opens the customer app already checked in to this table (CustomerContext reads ?table=).
// The counter QR (tableNumber 'counter') opens it in loyalty-only Counter mode.
// Each link carries the table's signed key (?k=), so editing the table number in it doesn't work.
export const COUNTER_QR = 'counter';

// Keys come from the server (it holds the secret); fetched again each time so new tables are included.
async function qrKey(tableNumber) {
  const res = await axios.get('/api/tables/qr-keys');
  const key = res.data?.keys?.[tableNumber];
  if (!key) throw new Error(`No QR key for ${tableNumber}`);
  return key;
}

export async function tableOrderUrl(tableNumber) {
  const k = encodeURIComponent(await qrKey(tableNumber));
  return tableNumber === COUNTER_QR
    ? `${appBaseUrl()}/customer?counter=1&k=${k}`
    : `${appBaseUrl()}/customer?table=${tableNumber}&k=${k}`;
}
const placeName = (tableNumber) => (tableNumber === COUNTER_QR ? 'Counter' : `Table ${tableNumber}`);

const isLocalOnly = (url) => /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(url);

const qrDataUrl = (url, width = 600) =>
  QRCode.toDataURL(url, { width, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#1A202C', light: '#FFFFFF' } });

// Printable table cards (one per page section), for a single table or all of them.
export async function printTableQRs(tables, restaurantName) {
  const win = window.open('', '_blank', 'width=820,height=900');
  if (!win) {
    window.alert('Please allow pop-ups for this site to print QR codes.');
    return;
  }
  let cards;
  try {
    cards = await Promise.all(tables.map(async (t) => ({ n: t.tableNumber, img: await qrDataUrl(await tableOrderUrl(t.tableNumber), 700) })));
  } catch {
    win.close();
    window.alert('Could not create the QR codes. Please check the connection and try again.');
    return;
  }
  const e = escapeHtml;
  win.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Table QR Codes</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Inter', Arial, sans-serif; color: #1A202C; }
      .grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 18px; padding: 18px; }
      .card { width: 88mm; border: 2px solid #FF6B35; border-radius: 14px; padding: 16px 14px; text-align: center; page-break-inside: avoid; break-inside: avoid; }
      .name { font-size: 18px; font-weight: 800; }
      .table { font-size: 34px; font-weight: 900; color: #FF6B35; margin: 4px 0 8px; }
      img { width: 62mm; height: 62mm; }
      .hint { font-size: 13px; font-weight: 600; margin-top: 6px; }
      .sub { font-size: 11px; color: #4A5568; margin-top: 2px; }
      @media print { @page { margin: 8mm; } .grid { padding: 0; } }
    </style>
  </head>
  <body>
    <div class="grid">
      ${cards.map(c => `
        <div class="card">
          <div class="name">${e(restaurantName || 'Restaurant')}</div>
          <div class="table">${e(placeName(c.n))}</div>
          <img src="${c.img}" alt="QR code for ${e(placeName(c.n))}" />
          <div class="hint">${c.n === COUNTER_QR ? '📱 Scan to collect loyalty stamps' : '📱 Scan to view menu &amp; order'}</div>
          <div class="sub">Earn loyalty stamps with every visit</div>
        </div>`).join('')}
    </div>
  </body>
</html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
}

// Modal with one table's QR code, download and print.
export default function TableQRModal({ table, restaurantName, onClose }) {
  const [img, setImg] = useState('');
  const [url, setUrl] = useState('');

  useEffect(() => {
    let live = true;
    tableOrderUrl(table.tableNumber)
      .then(async (u) => { const i = await qrDataUrl(u); if (live) { setUrl(u); setImg(i); } })
      .catch(() => { if (live) { setUrl(''); setImg(''); } });
    return () => { live = false; };
  }, [table.tableNumber]);

  const download = () => {
    const a = document.createElement('a');
    a.href = img;
    a.download = `${placeName(table.tableNumber).replace(' ', '_')}_QR.png`;
    a.click();
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      window.alert('Link copied');
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📱 {table.tableNumber === COUNTER_QR ? 'Counter' : `Table T${table.tableNumber}`} QR Code</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ textAlign: 'center' }}>
          <div style={{ border: '2px solid #FF6B35', borderRadius: 14, padding: 16, display: 'inline-block', background: 'white' }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{restaurantName || 'Restaurant'}</div>
            <div style={{ fontWeight: 900, fontSize: 26, color: '#FF6B35', margin: '2px 0 8px' }}>{placeName(table.tableNumber)}</div>
            {img
              ? <img src={img} alt={`QR code for ${placeName(table.tableNumber)}`} style={{ width: 220, height: 220, display: 'block', margin: '0 auto' }} />
              : <div style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>}
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>
              {table.tableNumber === COUNTER_QR ? '📱 Scan to collect loyalty stamps' : '📱 Scan to view menu & order'}
            </div>
          </div>

          <div style={{ fontSize: 11, color: '#718096', marginTop: 12, wordBreak: 'break-all' }}>{url}</div>
          {isLocalOnly(url) && (
            <div style={{ background: '#FFFBEB', border: '1px solid #F6AD55', color: '#92400E', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginTop: 10, textAlign: 'left' }}>
              ⚠️ This code points to <strong>localhost</strong>, which only works on this computer. Open this page from the
              restaurant's live address (or set NEXT_PUBLIC_APP_URL) before printing codes for the tables.
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={copy} disabled={!url}>🔗 Copy Link</button>
          <button type="button" className="btn btn-ghost" onClick={download} disabled={!img}>⬇️ Download</button>
          <button type="button" className="btn btn-primary" onClick={() => printTableQRs([table], restaurantName)}>🖨️ Print</button>
        </div>
      </div>
    </div>
  );
}

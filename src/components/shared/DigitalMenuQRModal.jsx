'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { appBaseUrl } from './TableQR';

export default function DigitalMenuQRModal({ restaurantName = "Sufi's Cafe", onClose }) {
  const [img, setImg] = useState('');
  const [url, setUrl] = useState('');

  useEffect(() => {
    const menuUrl = `${appBaseUrl()}/menu`;
    setUrl(menuUrl);
    QRCode.toDataURL(menuUrl, {
      width: 700,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#07241A', light: '#FFFFFF' }
    })
      .then(i => setImg(i))
      .catch(err => console.warn('QR generation error:', err));
  }, []);

  const download = () => {
    if (!img) return;
    const a = document.createElement('a');
    a.href = img;
    a.download = `Sufis_Cafe_Digital_Menu_QR.png`;
    a.click();
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      window.alert('Digital menu link copied to clipboard!');
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  const print = () => {
    const win = window.open('', '_blank', 'width=750,height=900');
    if (!win) {
      window.alert('Please allow pop-ups to print the QR standee.');
      return;
    }
    win.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Sufi's Cafe - Digital Menu QR Standee</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: 'Inter', -apple-system, sans-serif;
        background: #F9F7F2;
        color: #07241A;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        padding: 20px;
      }
      .standee-card {
        width: 105mm;
        border: 2px solid #C8A251;
        border-radius: 18px;
        padding: 32px 24px;
        text-align: center;
        background: #07241A;
        color: #F6F2E9;
        box-shadow: 0 10px 30px rgba(0,0,0,0.15);
      }
      .logo {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        margin-bottom: 12px;
        border: 2px solid #C8A251;
      }
      .title {
        font-family: Georgia, serif;
        font-size: 26px;
        font-weight: 700;
        color: #D8B467;
        margin-bottom: 4px;
      }
      .tagline {
        font-size: 10px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: #C8A251;
        margin-bottom: 18px;
      }
      .qr-frame {
        background: #FFFFFF;
        padding: 14px;
        border-radius: 14px;
        display: inline-block;
        margin-bottom: 16px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      }
      .qr-frame img {
        width: 58mm;
        height: 58mm;
        display: block;
      }
      .scan-cta {
        font-size: 15px;
        font-weight: 700;
        color: #D8B467;
        margin-bottom: 4px;
      }
      .subtext {
        font-size: 11px;
        color: #BCA477;
        font-style: italic;
      }
      @media print {
        body { background: white; padding: 0; }
        .standee-card { box-shadow: none; border-color: #07241A; }
      }
    </style>
  </head>
  <body>
    <div class="standee-card">
      <img src="/brand/sufis-logo.png" class="logo" alt="Sufi's Cafe" />
      <div class="title">${restaurantName || "Sufi's Cafe"}</div>
      <div class="tagline">COFFEE · COMFORT · CONNECTION</div>
      <div class="qr-frame">
        <img src="${img}" alt="Scan for Digital Menu" />
      </div>
      <div class="scan-cta">📱 SCAN FOR DIGITAL MENU</div>
      <div class="subtext">Browse our live artisanal coffee & food menu</div>
    </div>
  </body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📱</span> Digital Menu QR Code
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ textAlign: 'center' }}>
          <div style={{
            background: '#07241A',
            border: '2px solid #C8A251',
            borderRadius: 16,
            padding: '24px 18px',
            display: 'inline-block',
            color: '#F6F2E9',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            margin: '0 auto',
            maxWidth: '100%'
          }}>
            <div style={{ fontSize: 20, fontFamily: 'serif', fontWeight: 700, color: '#D8B467', marginBottom: 2 }}>
              {restaurantName || "Sufi's Cafe"}
            </div>
            <div style={{ fontSize: 10, letterSpacing: '0.18em', color: '#C8A251', textTransform: 'uppercase', marginBottom: 14 }}>
              COFFEE · COMFORT · CONNECTION
            </div>

            <div style={{
              background: '#FFFFFF',
              borderRadius: 12,
              padding: 10,
              display: 'inline-block',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}>
              {img ? (
                <img
                  src={img}
                  alt="Digital Menu QR"
                  style={{ width: 200, height: 200, display: 'block' }}
                />
              ) : (
                <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner" />
                </div>
              )}
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: '#D8B467', marginTop: 14 }}>
              📱 Scan to View Live Digital Menu
            </div>
            <div style={{ fontSize: 11, color: '#BCA477', fontStyle: 'italic', marginTop: 3 }}>
              Live synced with Admin Menu changes
            </div>
          </div>

          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 14, wordBreak: 'break-all' }}>
            {url}
          </div>
        </div>

        <div className="modal-footer" style={{ flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
          <button type="button" className="btn btn-ghost" onClick={() => window.open('/menu', '_blank')}>
            👀 Open Menu
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={copy} disabled={!url}>
              🔗 Copy Link
            </button>
            <button type="button" className="btn btn-secondary" onClick={download} disabled={!img}>
              ⬇️ Download
            </button>
            <button type="button" className="btn btn-primary" onClick={print} disabled={!img}>
              🖨️ Print Standee
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


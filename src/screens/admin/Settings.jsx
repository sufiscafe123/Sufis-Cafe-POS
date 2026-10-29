'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import PasswordInput from '../../components/shared/PasswordInput';

const FIELDS = [
  { key: 'name', label: 'Restaurant Name', placeholder: 'As printed on the bill', required: true },
  { key: 'address', label: 'Address', placeholder: 'Shop no., street, city, PIN' },
  { key: 'phone', label: 'Phone', placeholder: 'e.g. 022 1234 5678' },
  { key: 'email', label: 'Email', placeholder: 'owner@restaurant.com', type: 'email' },
  { key: 'gstNumber', label: 'GSTIN', placeholder: '15 characters, e.g. 27ABCDE1234F1Z5', hint: 'Printed on every bill as GSTNo. Leave empty if not GST registered.' },
  { key: 'gstRate', label: 'GST Rate (%)', type: 'number', hint: 'Usually 5% for restaurants. Split equally into CGST + SGST on the bill.' },
  { key: 'fssaiNumber', label: 'FSSAI Licence No.', placeholder: 'Optional' },
  { key: 'receiptFooter', label: 'Bill Footer Message', placeholder: 'Thank you for dining with us!' }
];

export default function Settings() {
  const { restaurant, setRestaurant } = useAuth();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  useEffect(() => {
    axios.get('/api/restaurant')
      .then(res => setForm(res.data))
      .catch(() => setForm(restaurant || {}));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await axios.put('/api/restaurant', form);
      setRestaurant(res.data);
      setForm(res.data);
      toast.success('Restaurant details saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) {
      toast.error('New passwords do not match');
      return;
    }
    try {
      await axios.put('/api/auth/password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      toast.success('Password changed');
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not change password');
    }
  };

  if (!form) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="text-muted text-sm" style={{ marginTop: 2 }}>Business details printed on every bill</p>
        </div>
      </div>
      <div className="page-body">
        <div className="grid-2" style={{ gap: 24, alignItems: 'start' }}>
          <form className="card" onSubmit={save}>
            <h3 style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '1rem', marginBottom: 16 }}>🏪 Restaurant & GST Details</h3>
            {FIELDS.map(f => (
              <div className="form-group" key={f.key}>
                <label className="form-label">{f.label}</label>
                <input
                  className="form-input"
                  type={f.type || 'text'}
                  required={f.required}
                  placeholder={f.placeholder}
                  min={f.type === 'number' ? 0 : undefined}
                  max={f.type === 'number' ? 28 : undefined}
                  step={f.type === 'number' ? 0.5 : undefined}
                  value={form[f.key] ?? ''}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                />
                {f.hint && <p className="text-sm text-muted" style={{ marginTop: 4 }}>{f.hint}</p>}
              </div>
            ))}
            <button type="submit" className="btn btn-primary w-full" disabled={saving}>
              {saving ? 'Saving…' : 'Save Details'}
            </button>
          </form>

          <form className="card" onSubmit={changePassword}>
            <h3 style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '1rem', marginBottom: 16 }}>🔒 Change My Password</h3>
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <PasswordInput required autoComplete="current-password" value={pw.currentPassword}
                onChange={e => setPw(p => ({ ...p, currentPassword: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <PasswordInput required minLength={8} autoComplete="new-password" value={pw.newPassword}
                onChange={e => setPw(p => ({ ...p, newPassword: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <PasswordInput required minLength={8} autoComplete="new-password" value={pw.confirm}
                onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} />
            </div>
            <button type="submit" className="btn btn-primary w-full">Change Password</button>
          </form>
        </div>
      </div>
    </div>
  );
}

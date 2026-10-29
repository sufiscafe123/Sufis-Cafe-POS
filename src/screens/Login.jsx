'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from '@/lib/router';
import toast from 'react-hot-toast';
import PasswordInput from '../components/shared/PasswordInput';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      toast.success(`Welcome, ${user.name}!`);
      if (user.role === 'admin') navigate('/admin/dashboard');
      else if (user.role === 'waiter') navigate('/waiter/tables');
      else navigate('/kitchen/orders');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <h1>🍽️ SRMS</h1>
          <p>Smart Restaurant Management System</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input className="form-input" type="email" placeholder="Enter your email"
              value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <PasswordInput placeholder="Enter your password" autoComplete="current-password"
              value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required />
          </div>
          <button className="btn btn-primary w-full btn-lg" type="submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

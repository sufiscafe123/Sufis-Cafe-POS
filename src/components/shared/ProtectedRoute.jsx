'use client';

import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from '@/lib/router';

// Same guard as App.js. The server layouts already redirect before this renders; this one
// reacts to a logout or an expired session while a screen is open.
export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-center"><div className="spinner"></div></div>;
  if (!user) return <Navigate to="/login" />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" />;
  return children;
}

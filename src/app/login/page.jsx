'use client';

import { Suspense } from 'react';
import Login from '@/screens/Login';
import { useAuth } from '@/context/AuthContext';
import { Navigate } from '@/lib/router';

export default function LoginPage() {
  return <Suspense><LoginGate /></Suspense>;
}

function LoginGate() {
  const { user } = useAuth();
  return user ? <Navigate to="/" /> : <Login />;
}

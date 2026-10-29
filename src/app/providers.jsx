'use client';

import React, { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/context/AuthContext';

// The screens are browser-only (localStorage, audio, print windows), as in the original
// single-page app, so they render after mounting.
export default function Providers({ children, initialUser, initialRestaurant }) {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  return (
    <AuthProvider initialUser={initialUser} initialRestaurant={initialRestaurant}>
      {mounted ? children : <div className="loading-center"><div className="spinner"></div></div>}
      <Toaster position="top-right" toastOptions={{
        style: { fontSize: '0.875rem', borderRadius: '8px' },
        success: { iconTheme: { primary: '#48BB78', secondary: 'white' } },
        error: { iconTheme: { primary: '#E53E3E', secondary: 'white' } }
      }} />
    </AuthProvider>
  );
}

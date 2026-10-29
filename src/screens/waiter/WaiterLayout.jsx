'use client';

import React from 'react';
import Sidebar from '../../components/shared/Sidebar';
import { SocketProvider } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';

// The pages themselves are Next.js routes under src/app/waiter/*
export default function WaiterLayout({ children }) {
  const { user } = useAuth();
  return (
    <SocketProvider role="waiter">
      <div className="app-layout">
        <Sidebar role={user?.role === 'admin' ? 'admin' : 'waiter'} />
        <div className="main-content">
          {children}
        </div>
      </div>
    </SocketProvider>
  );
}

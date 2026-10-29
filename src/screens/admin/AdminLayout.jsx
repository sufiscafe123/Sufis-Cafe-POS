'use client';

import React from 'react';
import Sidebar from '../../components/shared/Sidebar';
import { SocketProvider } from '../../context/SocketContext';

// The pages themselves are Next.js routes under src/app/admin/*
export default function AdminLayout({ children }) {
  return (
    <SocketProvider role="admin">
      <div className="app-layout">
        <Sidebar role="admin" />
        <div className="main-content">
          {children}
        </div>
      </div>
    </SocketProvider>
  );
}

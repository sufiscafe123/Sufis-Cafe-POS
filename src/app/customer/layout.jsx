'use client';

import { Suspense } from 'react';
import { CustomerProvider } from '@/customer/CustomerContext';

// Customer Mobile Ordering & Loyalty Portal (Table QR Entry)
export default function Layout({ children }) {
  return <Suspense><CustomerProvider>{children}</CustomerProvider></Suspense>;
}

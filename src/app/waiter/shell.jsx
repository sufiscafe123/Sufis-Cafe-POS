'use client';

import { Suspense } from 'react';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import WaiterLayout from '@/screens/waiter/WaiterLayout';

export default function Shell({ children }) {
  // Suspense: the shared router hooks read the URL's search params
  return (
    <Suspense>
    <ProtectedRoute roles={['waiter', 'admin']}>
      <WaiterLayout>{children}</WaiterLayout>
    </ProtectedRoute>
    </Suspense>
  );
}

'use client';

import { Suspense } from 'react';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import KitchenLayout from '@/screens/kitchen/KitchenLayout';

export default function Shell({ children }) {
  // Suspense: the shared router hooks read the URL's search params
  return (
    <Suspense>
    <ProtectedRoute roles={['kitchen', 'admin']}>
      <KitchenLayout>{children}</KitchenLayout>
    </ProtectedRoute>
    </Suspense>
  );
}

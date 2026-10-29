'use client';

import { Suspense } from 'react';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import AdminLayout from '@/screens/admin/AdminLayout';

export default function Shell({ children }) {
  // Suspense: the shared router hooks read the URL's search params
  return (
    <Suspense>
    <ProtectedRoute roles={['admin']}>
      <AdminLayout>{children}</AdminLayout>
    </ProtectedRoute>
    </Suspense>
  );
}

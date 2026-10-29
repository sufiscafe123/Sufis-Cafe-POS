'use client';

import { Navigate } from '@/lib/router';

// Unknown URLs go back to the start page, like `<Route path="*" element={<Navigate to="/" />} />`.
// (Client-side on purpose: a server redirect here would run while every page renders.)
export default function NotFound() {
  return <Navigate to="/" replace />;
}

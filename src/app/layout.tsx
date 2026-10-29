import type { Metadata, Viewport } from 'next';
import Providers from './providers';
import { currentSession } from '@/server/pageAuth';
import '@/styles/index.css';
import '@/styles/customer.css';
import '@/styles/customer-theme.css';

// Every page depends on the signed-in session
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'SRMS - Smart Restaurant Management',
  description: 'Smart Restaurant Management System',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1a1a2e',
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers initialUser={session?.user ?? null} initialRestaurant={session?.restaurant ?? null}>
          {children}
        </Providers>
      </body>
    </html>
  );
}

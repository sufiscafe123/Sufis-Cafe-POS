import { requirePageRole } from '@/server/pageAuth';
import Shell from './shell';

export const dynamic = 'force-dynamic';

// Server-side guard: only kitchen / admin may open these screens.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePageRole(['kitchen', 'admin']);
  return <Shell>{children}</Shell>;
}

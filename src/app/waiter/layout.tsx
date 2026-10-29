import { requirePageRole } from '@/server/pageAuth';
import Shell from './shell';

export const dynamic = 'force-dynamic';

// Server-side guard: only waiter / admin may open these screens.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePageRole(['waiter', 'admin']);
  return <Shell>{children}</Shell>;
}

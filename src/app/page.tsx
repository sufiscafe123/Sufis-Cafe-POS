import { redirect } from 'next/navigation';
import { currentSession, homeFor } from '@/server/pageAuth';

export default async function Home() {
  const session = await currentSession();
  redirect(session ? homeFor(session.user.role) : '/login');
}

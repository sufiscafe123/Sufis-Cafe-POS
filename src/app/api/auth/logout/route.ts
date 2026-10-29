import { createSupabaseServerClient } from '@/lib/supabase/server';
import { json, route } from '@/server/http';

export const POST = route(async () => {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: 'local' });
  return json({ message: 'Logged out' });
});

'use client';

// The small part of the react-router-dom API the original screens use, implemented on the
// Next.js App Router, so the screens themselves did not have to change.
import { useCallback, useEffect, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams as useNextSearchParams } from 'next/navigation';

// react-router's `navigate(path, { state })`: the state is kept for the page it was sent to.
let navState = { path: null, state: null };

export function useNavigate() {
  const router = useRouter();
  return useCallback((to, options = {}) => {
    if (typeof to === 'number') {
      if (to < 0) router.back(); else router.forward();
      return;
    }
    navState = { path: String(to).split('?')[0], state: options.state ?? null };
    if (options.replace) router.replace(to);
    else router.push(to);
  }, [router]);
}

export function useLocation() {
  const pathname = usePathname();
  const params = useNextSearchParams();
  return useMemo(() => {
    const search = params?.toString() ? `?${params.toString()}` : '';
    return { pathname, search, state: navState.path === pathname ? navState.state : null };
  }, [pathname, params]);
}

export function useSearchParams() {
  const params = useNextSearchParams();
  return [params];
}

export function Navigate({ to, replace }) {
  const navigate = useNavigate();
  useEffect(() => { navigate(to, { replace }); }, [to, replace, navigate]);
  return null;
}

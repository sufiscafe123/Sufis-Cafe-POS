import 'server-only';
import { rpc } from './db';
import { ApiError } from './http';

// middleware/rateLimit.js, backed by Postgres so the limit holds across serverless instances.
export async function rateLimit(key: string, { windowMs, max, message }: { windowMs: number; max: number; message?: string }) {
  let result: { allowed: boolean; retry_after: number };
  try {
    result = await rpc('hit_rate_limit', { p_key: key, p_window_seconds: Math.ceil(windowMs / 1000), p_max: max });
  } catch (err) {
    // Never lock everyone out because the limiter itself failed
    console.error('Rate limiter unavailable:', err);
    return;
  }
  if (!result.allowed) {
    const err = new ApiError(429, message || 'Too many requests. Please try again shortly.');
    (err as ApiError & { retryAfter?: number }).retryAfter = result.retry_after;
    throw err;
  }
}

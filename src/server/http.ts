import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

// An error with the HTTP status and JSON body the original Express routes sent.
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  NextResponse.json(body, { status, headers });

type Ctx = { params: Promise<Record<string, string>> };
type Handler = (req: NextRequest, params: Record<string, string>) => Promise<Response>;

// Wraps a Route Handler: unknown errors become { message } with the given fallback status,
// matching `res.status(500).json({ message: err.message })` in the old routes.
export function route(handler: Handler, fallbackStatus = 500) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      const params = ctx?.params ? await ctx.params : {};
      return await handler(req, params);
    } catch (err) {
      if (err instanceof ApiError) {
        const retryAfter = (err as ApiError & { retryAfter?: number }).retryAfter;
        return json(
          err.code ? { message: err.message, code: err.code } : { message: err.message },
          err.status,
          retryAfter !== undefined ? { 'Retry-After': String(retryAfter) } : undefined
        );
      }
      console.error(err);
      return json({ message: err instanceof Error ? err.message : 'Something went wrong' }, fallbackStatus);
    }
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readBody(req: NextRequest): Promise<Record<string, any>> {
  const text = await req.text();
  if (text.length > 200 * 1024) throw new ApiError(413, 'Request body is too large');
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new ApiError(400, 'Invalid JSON body');
  }
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

// Same helpers as backend/utils/validate.js.

// Escapes user text before it is used inside an ILIKE pattern (search boxes, duplicate-name checks).
export const escapeLike = (str: string) => String(str).replace(/[\\%_]/g, (c) => `\\${c}`);

// Indian mobile numbers: keep the last 10 digits, accept +91 / 0 prefixes.
export const normalizePhone = (phone: unknown): string | null => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
};

export const toPositiveInt = (value: unknown, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}): number | null => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
};

export const ROLES = ['admin', 'waiter', 'kitchen'];

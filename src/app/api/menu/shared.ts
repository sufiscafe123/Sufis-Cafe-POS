/* eslint-disable @typescript-eslint/no-explicit-any */
export const validPrice = (p: unknown) => p !== undefined && p !== '' && p !== null && Number.isFinite(Number(p)) && Number(p) >= 0;

// The editable MenuItem fields, mapped to columns. Anything else in the body is ignored.
export function menuFields(body: Record<string, any>) {
  const out: Record<string, unknown> = {};
  if (body.category !== undefined) out.category = String(body.category).trim();
  if (body.price !== undefined) out.price = Number(body.price);
  if (body.description !== undefined) out.description = String(body.description ?? '');
  if (body.available !== undefined) out.available = Boolean(body.available);
  if (body.isVeg !== undefined) out.is_veg = Boolean(body.isVeg);
  if (body.image !== undefined) out.image = String(body.image ?? '');
  return out;
}

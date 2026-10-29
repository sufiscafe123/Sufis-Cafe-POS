import { requireAdmin, requireStaff } from '@/server/auth';
import { db, must } from '@/server/db';
import { ApiError, json, readBody, route } from '@/server/http';
import { restaurantInfo } from '@/server/mappers';

export const GET = route(async () => {
  const ctx = await requireStaff();
  return json(restaurantInfo(ctx.restaurant));
});

// Admin: business details printed on every bill (name, address, GSTIN, GST rate…)
export const PUT = route(async (req) => {
  const ctx = await requireAdmin();
  const body = await readBody(req);
  const r = ctx.restaurant;
  const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
  const update: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = text(body.name, 100);
    if (!name) throw new ApiError(400, 'Restaurant name is required');
    update.name = name;
  }
  if (body.address !== undefined) update.address = text(body.address, 300);
  if (body.phone !== undefined) update.phone = text(body.phone, 30);
  if (body.email !== undefined) update.email = text(body.email, 100) || r.email;
  if (body.fssaiNumber !== undefined) update.fssai_number = text(body.fssaiNumber, 20);
  if (body.receiptFooter !== undefined) update.receipt_footer = text(body.receiptFooter, 150);
  if (body.gstNumber !== undefined) {
    const gstin = text(body.gstNumber, 15).toUpperCase();
    if (gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) {
      throw new ApiError(400, 'GSTIN must be 15 characters, e.g. 27ABCDE1234F1Z5');
    }
    update.gst_number = gstin;
  }
  if (body.gstRate !== undefined) {
    const rate = Number(body.gstRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 28) throw new ApiError(400, 'GST rate must be between 0 and 28');
    update.gst_rate = rate;
  }

  const row = Object.keys(update).length
    ? must(await db().from('restaurants').update(update).eq('id', r.id).select('*').single())
    : r;
  return json(restaurantInfo(row));
}, 400);

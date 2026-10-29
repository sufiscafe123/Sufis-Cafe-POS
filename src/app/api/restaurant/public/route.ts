import { activeRestaurant } from '@/server/auth';
import { ApiError, json, route } from '@/server/http';

// Public info for the customer QR app (name and GST rate for the running bill)
export const GET = route(async () => {
  const r = await activeRestaurant();
  if (!r) throw new ApiError(404, 'Restaurant not found');
  return json({ name: r.name, gstRate: r.gst_rate === null ? 5 : Number(r.gst_rate) });
});

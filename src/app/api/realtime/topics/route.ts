import type { NextRequest } from 'next/server';
import { CUSTOMER_TOKEN_HEADER, activeRestaurant, lookupStaff, resolveCustomerToken } from '@/server/auth';
import { json, route } from '@/server/http';
import { customerTopic, grantCustomerTopics, publicTopic, staffTopic, tableTopic } from '@/server/realtime';

// Which Realtime topics this browser should join — the Supabase equivalent of the
// Socket.IO handshake that decided which rooms a connection joined.
export const GET = route(async (req: NextRequest) => {
  const customerToken = req.headers.get(CUSTOMER_TOKEN_HEADER);
  if (customerToken) {
    const customer = await resolveCustomerToken(customerToken).catch(() => null);
    if (customer) {
      await grantCustomerTopics(customer.restaurantId, customer.customerId, customer.tableNumber);
      return json({
        topics: [
          customerTopic(customer.customerId),
          ...(customer.tableNumber > 0 ? [tableTopic(customer.restaurantId, customer.tableNumber)] : []),
          publicTopic(customer.restaurantId),
        ],
      });
    }
  } else {
    const staff = await lookupStaff();
    if (staff.ok) {
      return json({ topics: [staffTopic(staff.ctx.restaurantId), publicTopic(staff.ctx.restaurantId)] });
    }
  }
  // Anonymous: public events only (menu changes)
  const restaurant = await activeRestaurant();
  return json({ topics: restaurant ? [publicTopic(restaurant.id)] : [] });
});

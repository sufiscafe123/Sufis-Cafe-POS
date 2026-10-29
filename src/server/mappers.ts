// Database rows → the JSON shapes the original Express API returned (Mongoose documents),
// so every screen keeps reading `_id`, `orderNumber`, `items[]`, `createdAt`… unchanged.
/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = Record<string, any>;

const num = (v: unknown) => (v === null || v === undefined ? v : Number(v)) as number;
const byPosition = (a: Row, b: Row) => (a.position ?? 0) - (b.position ?? 0);

export function restaurantInfo(r: Row) {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    phone: r.phone,
    email: r.email,
    address: r.address,
    gstNumber: r.gst_number,
    gstRate: r.gst_rate === null || r.gst_rate === undefined ? 5 : Number(r.gst_rate),
    fssaiNumber: r.fssai_number,
    receiptFooter: r.receipt_footer,
  };
}

export function staffUser(s: Row) {
  return { id: s.id, name: s.name, email: s.email, role: s.role };
}

export function staffDoc(s: Row) {
  return {
    _id: s.id,
    restaurantId: s.restaurant_id,
    name: s.name,
    email: s.email,
    role: s.role,
    active: s.active,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

export function tableDoc(t: Row) {
  return {
    _id: t.id,
    restaurantId: t.restaurant_id,
    tableNumber: t.table_number,
    capacity: t.capacity,
    status: t.status,
    currentOrderId: t.current_order_id,
    customerCount: t.customer_count,
    billRequested: t.bill_requested,
    billRequestedAt: t.bill_requested_at,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

export function categoryDoc(c: Row) {
  return {
    _id: c.id,
    restaurantId: c.restaurant_id,
    name: c.name,
    icon: c.icon,
    isActive: c.is_active,
    sortOrder: c.sort_order,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

export function menuItemDoc(m: Row) {
  return {
    _id: m.id,
    restaurantId: m.restaurant_id,
    name: m.name,
    category: m.category,
    price: num(m.price),
    description: m.description,
    available: m.available,
    isVeg: m.is_veg,
    image: m.image,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  };
}

export function orderItemDoc(i: Row) {
  return {
    _id: i.id,
    menuItemId: i.menu_item_id,
    name: i.name,
    price: num(i.price),
    quantity: i.quantity,
    notes: i.notes,
    served: i.served,
    addedAt: i.added_at,
    servedAt: i.served_at,
    batchNumber: i.batch_number,
  };
}

// `o.order_items` must be selected alongside the order.
export function orderDoc(o: Row) {
  const items = [...(o.order_items || [])].sort(byPosition).map(orderItemDoc);
  return {
    _id: o.id,
    restaurantId: o.restaurant_id,
    orderNumber: o.order_number,
    orderType: o.order_type,
    tableId: o.table_id,
    tableNumber: o.table_number,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    customerId: o.customer_id,
    customerCode: o.customer_code,
    appliedReward: o.applied_reward_id
      ? { rewardId: o.applied_reward_id, title: o.applied_reward_title, rewardType: o.applied_reward_type, discountAmount: num(o.applied_reward_discount) }
      : null,
    takeawayToken: o.takeaway_token,
    waiterId: o.waiter_id,
    waiterName: o.waiter_name,
    items,
    status: o.status,
    totalAmount: num(o.total_amount),
    customerCount: o.customer_count,
    notes: o.notes,
    batchCount: o.batch_count,
    lastUpdatedByWaiter: o.last_updated_by_waiter,
    billRequested: o.bill_requested,
    billRequestedAt: o.bill_requested_at,
    paymentPreference: o.payment_preference,
    requestedRewardId: o.requested_reward_id,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  };
}

// What a customer at the table is allowed to see of an order (utils/realtime.js publicOrder).
export function publicOrder(o: ReturnType<typeof orderDoc>) {
  return {
    _id: o._id,
    orderNumber: o.orderNumber,
    orderType: o.orderType,
    tableNumber: o.tableNumber,
    status: o.status,
    items: o.items.map(i => ({
      _id: i._id,
      menuItemId: i.menuItemId,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      notes: i.notes,
      served: i.served,
      batchNumber: i.batchNumber,
    })),
    totalAmount: o.totalAmount,
    batchCount: o.batchCount,
    billRequested: o.billRequested,
    billRequestedAt: o.billRequestedAt,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export function rewardDoc(r: Row) {
  return {
    _id: r.id,
    rewardId: r.reward_id,
    title: r.title,
    description: r.description,
    requiredStamps: r.required_stamps,
    rewardType: r.reward_type,
    rewardValue: num(r.reward_value),
    status: r.status,
    unlockedAt: r.unlocked_at,
    redeemedAt: r.redeemed_at,
    orderId: r.order_id,
  };
}

// `c.customer_rewards` and (optionally) `c.customer_orders` must be selected alongside.
export function customerDoc(c: Row) {
  return {
    _id: c.id,
    restaurantId: c.restaurant_id,
    customerId: c.customer_code,
    name: c.name,
    phone: c.phone,
    rewardToken: c.reward_token,
    totalStamps: c.total_stamps,
    maxStampsPerCard: c.max_stamps_per_card,
    rewards: [...(c.customer_rewards || [])].sort(byPosition).map(rewardDoc),
    activeTable: c.active_table,
    lastVisit: c.last_visit,
    orders: (c.customer_orders || [])
      .slice()
      .sort((a: Row, b: Row) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((co: Row) => co.order_id),
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

// Fields of a customer profile that the customer's own app needs (utils/realtime.js publicCustomer).
export function publicCustomer(c: ReturnType<typeof customerDoc>) {
  return {
    _id: c._id,
    customerId: c.customerId,
    name: c.name,
    phone: c.phone,
    rewardToken: c.rewardToken,
    totalStamps: c.totalStamps,
    maxStampsPerCard: c.maxStampsPerCard,
    rewards: c.rewards,
    activeTable: c.activeTable,
    lastVisit: c.lastVisit,
    createdAt: c.createdAt,
  };
}

export function loyaltySettingsDoc(s: Row) {
  return {
    _id: s.id,
    restaurantId: s.restaurant_id,
    stampsPerCard: s.stamps_per_card,
    minSpendForStamp: num(s.min_spend_for_stamp),
    milestones: [...(s.loyalty_milestones || [])].sort(byPosition).map((m: Row) => ({
      milestoneId: m.milestone_id,
      requiredStamps: m.required_stamps,
      title: m.title,
      description: m.description,
      rewardType: m.reward_type,
      rewardValue: num(m.reward_value),
      icon: m.icon,
      isActive: m.is_active,
    })),
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

// `b.bill_items` must be selected alongside the bill.
export function billDoc(b: Row) {
  return {
    _id: b.id,
    restaurantId: b.restaurant_id,
    billNumber: b.bill_number,
    // Day-wise number printed on the receipt (null on bills made before it existed)
    dailyBillNumber: b.daily_bill_number ?? null,
    orderId: b.order_id,
    orderNumber: b.order_number,
    orderType: b.order_type,
    tableNumber: b.table_number,
    customerName: b.customer_name,
    customerPhone: b.customer_phone,
    customerId: b.customer_id,
    takeawayToken: b.takeaway_token,
    items: [...(b.bill_items || [])].sort(byPosition).map((i: Row) => ({
      _id: i.id,
      name: i.name,
      quantity: i.quantity,
      price: num(i.price),
      total: num(i.total),
    })),
    subtotal: num(b.subtotal),
    discountAmount: num(b.discount_amount),
    // Only present when a reward was applied (the old schema's default sub-object made every
    // receipt print an empty "Reward: FREE" line).
    appliedReward: b.applied_reward_id
      ? { rewardId: b.applied_reward_id, title: b.applied_reward_title, rewardType: b.applied_reward_type, discountAmount: num(b.applied_reward_discount) }
      : undefined,
    gstRate: num(b.gst_rate),
    gstAmount: num(b.gst_amount),
    totalAmount: num(b.total_amount),
    paymentMode: b.payment_mode,
    paymentStatus: b.payment_status,
    customerCount: b.customer_count,
    billedBy: b.billed_by,
    billedByName: b.billed_by_name,
    stampAwarded: b.stamp_awarded,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

export type OrderDoc = ReturnType<typeof orderDoc>;
export type CustomerDoc = ReturnType<typeof customerDoc>;
export type BillDoc = ReturnType<typeof billDoc>;

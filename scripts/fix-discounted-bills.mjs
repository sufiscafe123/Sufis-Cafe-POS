// Port of backend/scripts/fix-discounted-bills.js for the Supabase database.
// Bills saved by the very old Bill model ignored the reward discount in the total; this
// recalculates them with the current bill maths.
//
//   node scripts/fix-discounted-bills.mjs           # dry run: only lists what would change
//   node scripts/fix-discounted-bills.mjs --apply   # writes the corrected totals
//
// It also lists orders marked "completed" that never got a bill.

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { computeTotals } from '../src/lib/billing-math.js';

config({ path: '.env.local' });
config();

const apply = process.argv.includes('--apply');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function all(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

async function run() {
  console.log(`Mode: ${apply ? 'APPLY (writing changes)' : 'DRY RUN (no changes)'}\n`);
  const bills = await all(() => sb.from('bills').select('*').gt('discount_amount', 0).order('bill_number'));
  let fixed = 0;
  for (const bill of bills) {
    const t = computeTotals(Number(bill.subtotal), Number(bill.gst_rate ?? 5), Number(bill.discount_amount));
    if (Number(bill.total_amount) === t.totalAmount && Number(bill.gst_amount) === t.gstAmount) continue;
    console.log(`Bill #${bill.bill_number}: subtotal ${bill.subtotal}, discount ${bill.discount_amount} → ` +
      `GST ${bill.gst_amount} → ${t.gstAmount}, total ${bill.total_amount} → ${t.totalAmount}`);
    if (apply) await sb.from('bills').update({ gst_amount: t.gstAmount, total_amount: t.totalAmount }).eq('id', bill.id);
    fixed++;
  }
  console.log(`\n${fixed} bill(s) ${apply ? 'corrected' : 'need correcting'}.`);

  const billed = new Set((await all(() => sb.from('bills').select('order_id'))).map(b => b.order_id));
  const completed = await all(() => sb.from('orders').select('id, order_number, order_type, table_number, total_amount, created_at').eq('status', 'completed').order('created_at'));
  const unbilled = completed.filter(o => !billed.has(o.id));
  if (unbilled.length) {
    console.log(`\n${unbilled.length} completed order(s) have NO bill (not counted in revenue reports):`);
    unbilled.forEach(o => console.log(`  Order #${o.order_number}  ${o.order_type === 'takeaway' ? 'Parcel' : `Table ${o.table_number}`}  ` +
      `₹${o.total_amount}  ${new Date(o.created_at).toLocaleString('en-IN')}`));
  }
}

run().catch(err => {
  console.error('Failed:', err.message || err);
  process.exit(1);
});

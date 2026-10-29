// Bill maths and receipt printing shared by the admin and waiter billing screens.

const PAYMENT_ICONS = { cash: '💵', upi: '📱', card: '💳' };
export const paymentIcon = (mode) => PAYMENT_ICONS[mode] || '';

// Everything printed comes from the database, and names/notes are typed by customers,
// so it must be escaped before going into the print window.
export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

// Same maths as the server (src/server/billing.ts), so the preview matches the saved bill.
export { rewardDiscount, computeTotals } from '@/lib/billing-math';

// Receipt date / time in the style of a thermal bill: 28-Oct-2026, 02:35 pm
const formatDate = (d) => {
  const parts = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).formatToParts(new Date(d));
  const get = (t) => parts.find(p => p.type === t)?.value || '';
  return `${get('day')}-${get('month')}-${get('year')}`;
};
const formatTime = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

// Day-wise bill number (restarts at 1 every day); older bills fall back to the running number.
export const receiptBillNo = (bill) => bill.dailyBillNumber ?? bill.billNumber;

const tableLine = (bill) => (bill.orderType === 'takeaway'
  ? ['Parcel', bill.takeawayToken || `#${bill.orderNumber}`]
  : ['Table No', bill.tableNumber ?? '-']);

// The same dish ordered in several rounds (batches) is printed as one line, like a POS bill.
export function groupBillItems(items = []) {
  const lines = [];
  const byKey = new Map();
  items.forEach(item => {
    const key = `${String(item.name).trim().toLowerCase()}|${Number(item.price)}`;
    const line = byKey.get(key);
    if (line) {
      line.quantity += Number(item.quantity) || 0;
      line.total += Number(item.total) || 0;
    } else {
      const copy = { name: item.name, price: Number(item.price), quantity: Number(item.quantity) || 0, total: Number(item.total) || 0 };
      byKey.set(key, copy);
      lines.push(copy);
    }
  });
  return lines;
}

const totalQty = (bill) => (bill.items || []).reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

// Writes the bill into `win` (a window opened by the click handler, so pop-up blockers allow it)
// or opens one. GST is split into equal CGST + SGST; at 0% GST no tax lines are printed.
// The GSTIN from Settings is printed whenever one is saved.
export function printReceipt(bill, restaurant = {}, win = null) {
  const e = escapeHtml;
  const half = (bill.gstAmount || 0) / 2;
  const halfRate = (bill.gstRate || 0) / 2;
  const hasGst = (bill.gstRate || 0) > 0;
  const printWindow = win || window.open('', '_blank', 'width=420,height=750');
  if (!printWindow) {
    window.alert('Please allow pop-ups for this site to print bills.');
    return;
  }
  const [placeLabel, placeValue] = tableLine(bill);

  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Bill No ${e(receiptBillNo(bill))}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; width: 300px; margin: 0 auto; padding: 14px 8px; font-size: 12px; color: #000; }
      .center { text-align: center; }
      .name { font-size: 17px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 3px; }
      .info { font-size: 11.5px; line-height: 1.45; }
      .dash { border-top: 1px dashed #000; margin: 8px 0; }
      .double { border-top: 3px double #000; margin: 6px 0; }
      .meta { display: flex; justify-content: space-between; font-size: 12.5px; line-height: 1.6; }
      table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
      th { font-weight: 600; text-align: right; padding: 2px 0; }
      th:first-child, td:first-child { text-align: left; }
      td { text-align: right; padding: 1.5px 0; vertical-align: top; }
      td.desc { text-transform: uppercase; padding-right: 4px; }
      .qty { width: 30px; } .rate { width: 46px; } .amt { width: 62px; }
      .row { display: flex; justify-content: space-between; font-size: 12px; margin: 2px 0; }
      .total td { font-weight: 700; font-size: 13px; }
      .net { display: flex; justify-content: space-between; font-size: 17px; font-weight: 700; margin: 6px 0 2px; }
      .foot { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; margin-top: 4px; }
      @media print { @page { margin: 0; } }
    </style>
  </head>
  <body>
    <div class="center">
      <div class="name">${e(restaurant.name || 'Restaurant')}</div>
      ${restaurant.address ? `<div class="info">${e(restaurant.address)}</div>` : ''}
      ${restaurant.phone ? `<div class="info">Phone : ${e(restaurant.phone)}</div>` : ''}
      ${restaurant.gstNumber ? `<div class="info">GSTNo.: ${e(restaurant.gstNumber)}</div>` : ''}
    </div>
    <div class="dash"></div>
    <div class="meta"><span>Bill No : ${e(receiptBillNo(bill))}</span><span>Date : ${e(formatDate(bill.createdAt))}</span></div>
    <div class="meta"><span>${e(placeLabel)} : ${e(placeValue)}</span><span>Time : ${e(formatTime(bill.createdAt))}</span></div>
    <div class="double"></div>
    <table>
      <thead><tr><th>DESCRIPTION</th><th class="qty">QTY</th><th class="rate">RATE</th><th class="amt">AMOUNT</th></tr></thead>
    </table>
    <div class="double"></div>
    <table>
      <tbody>
        ${groupBillItems(bill.items).map(item => `<tr><td class="desc">${e(item.name)}</td><td class="qty">${e(item.quantity)}</td><td class="rate">${e(Number(item.price))}</td><td class="amt">${money(item.total)}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="dash"></div>
    <table>
      <tbody><tr class="total"><td>Total</td><td class="qty">${e(totalQty(bill))}</td><td class="rate"></td><td class="amt">${money(bill.subtotal)}</td></tr></tbody>
    </table>
    ${bill.discountAmount > 0 ? `<div class="row"><span>Discount${bill.appliedReward?.title ? ` (${e(bill.appliedReward.title)})` : ''}</span><span>-${money(bill.discountAmount)}</span></div>` : ''}
    ${hasGst ? `<div class="row"><span>CGST @ ${halfRate}%</span><span>${money(half)}</span></div>
    <div class="row"><span>SGST @ ${halfRate}%</span><span>${money(half)}</span></div>` : ''}
    <div class="dash"></div>
    <div class="net"><span>Net Payable</span><span>${money(bill.totalAmount)}</span></div>
    <div class="double"></div>
    <div class="foot"><span>E. &amp; O. E.</span><span>${e(restaurant.receiptFooter || 'Thanks... Visit Again...')}</span></div>
  </body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 350);
}

// Plain-text copy of the bill for the "Download" button in bill history (same layout).
export function receiptText(bill, restaurant = {}) {
  const W = 40;
  const line = '='.repeat(W);
  const dash = '-'.repeat(W);
  const center = (t) => { const s = String(t); return s.length >= W ? s : ' '.repeat(Math.floor((W - s.length) / 2)) + s; };
  const pair = (l, r) => l + ' '.repeat(Math.max(1, W - l.length - r.length)) + r;
  const col = (desc, qty, rate, amt) =>
    `${String(desc).toUpperCase().padEnd(19).slice(0, 19)}${String(qty).padStart(4)}${String(rate).padStart(7)}${String(amt).padStart(10)}`;
  const half = (bill.gstAmount || 0) / 2;
  const hasGst = (bill.gstRate || 0) > 0;
  const [placeLabel, placeValue] = tableLine(bill);
  return [
    center((restaurant.name || 'Restaurant').toUpperCase()),
    ...(restaurant.address ? [center(restaurant.address)] : []),
    ...(restaurant.phone ? [center(`Phone : ${restaurant.phone}`)] : []),
    ...(restaurant.gstNumber ? [center(`GSTNo.: ${restaurant.gstNumber}`)] : []),
    dash,
    pair(`Bill No : ${receiptBillNo(bill)}`, `Date : ${formatDate(bill.createdAt)}`),
    pair(`${placeLabel} : ${placeValue}`, `Time : ${formatTime(bill.createdAt)}`),
    line,
    col('DESCRIPTION', 'QTY', 'RATE', 'AMOUNT'),
    line,
    ...groupBillItems(bill.items).map(item => col(item.name, item.quantity, Number(item.price), money(item.total))),
    dash,
    col('Total', totalQty(bill), '', money(bill.subtotal)),
    ...(bill.discountAmount > 0 ? [pair('Discount', `-${money(bill.discountAmount)}`)] : []),
    ...(hasGst ? [
      pair(`CGST @ ${(bill.gstRate || 0) / 2}%`, money(half)),
      pair(`SGST @ ${(bill.gstRate || 0) / 2}%`, money(half)),
    ] : []),
    dash,
    pair('Net Payable', money(bill.totalAmount)),
    line,
    pair('E. & O. E.', restaurant.receiptFooter || 'Thanks... Visit Again...'),
  ].join('\n');
}

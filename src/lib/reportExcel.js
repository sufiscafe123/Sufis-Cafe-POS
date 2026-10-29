'use client';

// Excel (.xlsx) downloads for the Reports page. ExcelJS is loaded only when a report
// is downloaded, so it doesn't slow down the page.

const ORANGE = 'FFFF6B35';
const MONEY = '#,##0.00';
const PAY_MODES = [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card']];

const fmtDate = (d) => {
  const parts = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).formatToParts(new Date(d));
  const get = (t) => parts.find(p => p.type === t)?.value || '';
  return `${get('day')}-${get('month')}-${get('year')}`;
};
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const isoToDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

// Cafe name / address / GSTIN and the report title above each sheet's table.
function header(ws, restaurant, title, columns) {
  const span = columns.length;
  const lines = [
    [(restaurant?.name || 'Restaurant').toUpperCase(), { bold: true, size: 14 }],
    [restaurant?.address || '', { size: 10 }],
    [[restaurant?.phone ? `Phone: ${restaurant.phone}` : '', restaurant?.gstNumber ? `GSTIN: ${restaurant.gstNumber}` : ''].filter(Boolean).join('   '), { size: 10 }],
    [title, { bold: true, size: 12, color: { argb: ORANGE } }],
  ];
  lines.forEach(([text, font], i) => {
    const row = ws.getRow(i + 1);
    row.getCell(1).value = text;
    row.getCell(1).font = font;
    row.getCell(1).alignment = { horizontal: 'center', wrapText: true };
    ws.mergeCells(i + 1, 1, i + 1, span);
  });
  ws.getRow(2).height = restaurant?.address && restaurant.address.length > 60 ? 30 : 15;
  ws.addRow([]);
  ws.columns = columns.map(c => ({ key: c.key, width: c.width }));
  const head = ws.addRow(columns.map(c => c.header));
  head.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  ws.views = [{ state: 'frozen', ySplit: head.number }];
  return head.number;
}

function addRows(ws, columns, rows) {
  rows.forEach(r => {
    const row = ws.addRow(columns.map(c => r[c.key]));
    columns.forEach((c, i) => {
      if (c.money) row.getCell(i + 1).numFmt = MONEY;
      if (c.date) row.getCell(i + 1).numFmt = 'dd-mmm-yyyy';
    });
  });
}

function totalRow(ws, columns, values) {
  const row = ws.addRow(columns.map(c => values[c.key] ?? ''));
  row.eachCell((cell, i) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3EE' } };
    if (columns[i - 1]?.money) cell.numFmt = MONEY;
  });
}

async function save(wb, fileName) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

async function newWorkbook() {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SRMS';
  wb.created = new Date();
  return wb;
}

// Same dish from several bills / rounds → one line with total quantity and amount.
function itemSales(bills) {
  const map = new Map();
  bills.forEach(b => (b.items || []).forEach(i => {
    const key = `${String(i.name).trim().toLowerCase()}|${Number(i.price)}`;
    const row = map.get(key) || { name: i.name, rate: Number(i.price), qty: 0, amount: 0 };
    row.qty += Number(i.quantity) || 0;
    row.amount += Number(i.total) || 0;
    map.set(key, row);
  }));
  return [...map.values()].sort((a, b) => b.qty - a.qty || b.amount - a.amount);
}

/** Daily report: Summary, Bill-wise and Item-wise sheets for one date (YYYY-MM-DD). */
export async function downloadDailyReport(daily, date, restaurant) {
  const wb = await newWorkbook();
  const bills = daily.bills || [];
  const dateLabel = fmtDate(isoToDate(date));
  const items = itemSales(bills);
  const subtotal = bills.reduce((s, b) => s + (Number(b.subtotal) || 0), 0);

  // Summary
  const sumCols = [{ key: 'label', header: 'Particulars', width: 34 }, { key: 'value', header: 'Value', width: 22 }];
  const summary = wb.addWorksheet('Summary');
  header(summary, restaurant, `Daily Sales Report — ${dateLabel}`, sumCols);
  const rows = [
    ['Date', dateLabel],
    ['Total Bills', bills.length],
    ['Total Orders (placed)', daily.totalOrders || 0],
    ['Items Sold', items.reduce((s, i) => s + i.qty, 0)],
    ['Gross Sales (before discount & GST)', subtotal, true],
    ['Discount', daily.totalDiscount || 0, true],
    ...((daily.totalGst || 0) > 0 ? [['GST Collected', daily.totalGst, true]] : []),
    ['Net Revenue', daily.totalRevenue || 0, true],
    ['Average Bill Value', bills.length ? (daily.totalRevenue || 0) / bills.length : 0, true],
    ['Top Selling Item', items[0]?.name || '-'],
    ...PAY_MODES.map(([mode, label]) => {
      const list = bills.filter(b => b.paymentMode === mode);
      return [`Paid by ${label} (${list.length} bill${list.length === 1 ? '' : 's'})`, list.reduce((s, b) => s + (Number(b.totalAmount) || 0), 0), true];
    }),
  ];
  rows.forEach(([label, value, money]) => {
    const row = summary.addRow([label, value]);
    if (money) row.getCell(2).numFmt = MONEY;
    if (label === 'Net Revenue') row.font = { bold: true };
  });

  // Bill-wise
  const showGst = bills.some(b => (Number(b.gstAmount) || 0) > 0);
  const billCols = [
    { key: 'billNo', header: 'Bill No', width: 9 },
    { key: 'time', header: 'Time', width: 11 },
    { key: 'place', header: 'Table / Parcel', width: 16 },
    { key: 'customer', header: 'Customer', width: 22 },
    { key: 'qty', header: 'Items', width: 8 },
    { key: 'subtotal', header: 'Subtotal', width: 13, money: true },
    { key: 'discount', header: 'Discount', width: 12, money: true },
    ...(showGst ? [{ key: 'gst', header: 'GST', width: 11, money: true }] : []),
    { key: 'total', header: 'Net Amount', width: 14, money: true },
    { key: 'payment', header: 'Payment', width: 10 },
  ];
  const bws = wb.addWorksheet('Bill-wise');
  header(bws, restaurant, `Bill-wise Sales — ${dateLabel}`, billCols);
  addRows(bws, billCols, bills.map(b => ({
    billNo: b.dailyBillNumber ?? b.billNumber,
    time: fmtTime(b.createdAt),
    place: b.orderType === 'takeaway' ? `Parcel ${b.takeawayToken || ''}`.trim() : `Table ${b.tableNumber}`,
    customer: b.customerName || '',
    qty: (b.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0),
    subtotal: Number(b.subtotal) || 0,
    discount: Number(b.discountAmount) || 0,
    gst: Number(b.gstAmount) || 0,
    total: Number(b.totalAmount) || 0,
    payment: String(b.paymentMode || '').toUpperCase(),
  })));
  totalRow(bws, billCols, {
    billNo: 'TOTAL',
    qty: bills.reduce((s, b) => s + (b.items || []).reduce((x, i) => x + (Number(i.quantity) || 0), 0), 0),
    subtotal, discount: daily.totalDiscount || 0, gst: daily.totalGst || 0, total: daily.totalRevenue || 0,
  });

  // Item-wise
  const itemCols = [
    { key: 'no', header: '#', width: 5 },
    { key: 'name', header: 'Item', width: 30 },
    { key: 'qty', header: 'Qty Sold', width: 10 },
    { key: 'rate', header: 'Rate', width: 11, money: true },
    { key: 'amount', header: 'Amount', width: 14, money: true },
  ];
  const iws = wb.addWorksheet('Item-wise');
  header(iws, restaurant, `Item-wise Sales — ${dateLabel}`, itemCols);
  addRows(iws, itemCols, items.map((i, idx) => ({ no: idx + 1, ...i })));
  totalRow(iws, itemCols, { name: 'TOTAL', qty: items.reduce((s, i) => s + i.qty, 0), amount: items.reduce((s, i) => s + i.amount, 0) });

  await save(wb, `Daily_Report_${date}.xlsx`);
}

/** Monthly report: Month-wise and Day-wise sheets for a year. */
export async function downloadMonthlyReport(monthly, days, year, restaurant) {
  const wb = await newWorkbook();
  const months = monthly.monthlyData || [];

  const monthCols = [
    { key: 'month', header: 'Month', width: 16 },
    { key: 'orders', header: 'Bills', width: 10 },
    { key: 'revenue', header: 'Revenue', width: 16, money: true },
    { key: 'avg', header: 'Avg per Bill', width: 15, money: true },
    { key: 'cash', header: 'Cash', width: 14, money: true },
    { key: 'upi', header: 'UPI', width: 14, money: true },
    { key: 'card', header: 'Card', width: 14, money: true },
  ];
  // Payment split per month, from the day-wise data
  const byMonth = Array.from({ length: 12 }, () => ({ cash: 0, upi: 0, card: 0 }));
  days.forEach(d => {
    const m = Number(d.date.slice(5, 7)) - 1;
    PAY_MODES.forEach(([mode]) => { byMonth[m][mode] += Number(d[mode]) || 0; });
  });
  const payTotal = (mode) => byMonth.reduce((s, m) => s + m[mode], 0);
  const mws = wb.addWorksheet('Month-wise');
  header(mws, restaurant, `Monthly Sales Report — ${year}`, monthCols);
  addRows(mws, monthCols, months.map((m, i) => ({ ...m, avg: m.orders > 0 ? m.revenue / m.orders : 0, ...byMonth[i] })));
  const totalBills = months.reduce((s, m) => s + m.orders, 0);
  const totalRevenue = months.reduce((s, m) => s + m.revenue, 0);
  totalRow(mws, monthCols, { month: 'TOTAL', orders: totalBills, revenue: totalRevenue, avg: totalBills ? totalRevenue / totalBills : 0, cash: payTotal('cash'), upi: payTotal('upi'), card: payTotal('card') });

  const dayCols = [
    { key: 'date', header: 'Date', width: 14, date: true },
    { key: 'day', header: 'Day', width: 12 },
    { key: 'bills', header: 'Bills', width: 10 },
    { key: 'revenue', header: 'Revenue', width: 16, money: true },
    { key: 'avg', header: 'Avg per Bill', width: 15, money: true },
    { key: 'cash', header: 'Cash', width: 14, money: true },
    { key: 'upi', header: 'UPI', width: 14, money: true },
    { key: 'card', header: 'Card', width: 14, money: true },
  ];
  const dws = wb.addWorksheet('Day-wise');
  header(dws, restaurant, `Day-wise Sales — ${year}`, dayCols);
  addRows(dws, dayCols, days.map(d => {
    const dt = isoToDate(d.date);
    return { date: dt, day: dt.toLocaleDateString('en-IN', { weekday: 'long' }), bills: d.bills, revenue: d.revenue, avg: d.bills ? d.revenue / d.bills : 0, cash: d.cash || 0, upi: d.upi || 0, card: d.card || 0 };
  }));
  totalRow(dws, dayCols, { date: 'TOTAL', bills: totalBills, revenue: totalRevenue, cash: payTotal('cash'), upi: payTotal('upi'), card: payTotal('card') });

  await save(wb, `Monthly_Report_${year}.xlsx`);
}

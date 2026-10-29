import { beforeEach, describe, expect, test } from 'vitest';
import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';
import { downloadDailyReport, downloadMonthlyReport } from '@/lib/reportExcel';

// Capture the file the browser would download
let saved: { name: string; blob: Blob } | null = null;
beforeEach(() => {
  saved = null;
  let lastBlob: Blob | null = null;
  (globalThis as any).URL.createObjectURL = (b: Blob) => { lastBlob = b; return 'blob:x'; };
  (globalThis as any).URL.revokeObjectURL = () => {};
  (globalThis as any).document = {
    createElement: () => {
      const a: any = { click: () => { saved = { name: a.download, blob: lastBlob! }; } };
      return a;
    },
  };
});

async function readSaved() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await saved!.blob.arrayBuffer());
  if (process.env.EXCEL_OUT) writeFileSync(`${process.env.EXCEL_OUT}/${saved!.name}`, Buffer.from(await saved!.blob.arrayBuffer()));
  return wb;
}
const values = (ws: ExcelJS.Worksheet) => {
  const out: unknown[][] = [];
  ws.eachRow(r => out.push((r.values as unknown[]).slice(1)));
  return out;
};

const restaurant = { name: "Sufi's Cafe", address: 'NH-8, Kheda', phone: '9173331535', gstNumber: '' };
const daily = {
  totalRevenue: 3020, totalDiscount: 0, totalGst: 0, totalOrders: 3, completedOrders: 2,
  bills: [
    { billNumber: 5001, dailyBillNumber: 1, orderType: 'dine_in', tableNumber: 5, customerName: 'Saad', createdAt: '2026-10-28T08:00:00Z',
      items: [{ name: 'coffee', quantity: 1, price: 180, total: 180 }, { name: 'coffee', quantity: 6, price: 180, total: 1080 }, { name: 'tea', quantity: 7, price: 220, total: 1540 }],
      subtotal: 2800, discountAmount: 0, gstAmount: 0, totalAmount: 2800, paymentMode: 'upi' },
    { billNumber: 5002, dailyBillNumber: 2, orderType: 'takeaway', takeawayToken: 'TK-1004', customerName: 'SAAD', createdAt: '2026-10-28T09:00:00Z',
      items: [{ name: 'tea', quantity: 1, price: 220, total: 220 }], subtotal: 220, discountAmount: 0, gstAmount: 0, totalAmount: 220, paymentMode: 'cash' },
  ],
};

describe('Excel reports', () => {
  test('daily report: Summary, Bill-wise and Item-wise sheets', async () => {
    await downloadDailyReport(daily, '2026-10-28', restaurant);
    expect(saved!.name).toBe('Daily_Report_2026-10-28.xlsx');
    const wb = await readSaved();
    expect(wb.worksheets.map(w => w.name)).toEqual(['Summary', 'Bill-wise', 'Item-wise']);

    const summary = values(wb.getWorksheet('Summary')!);
    expect(summary[0][0]).toBe("SUFI'S CAFE");
    expect(summary).toContainEqual(['Total Bills', 2]);
    expect(summary).toContainEqual(['Items Sold', 15]);
    expect(summary).toContainEqual(['Net Revenue', 3020]);
    expect(summary).toContainEqual(['Top Selling Item', 'tea']);
    expect(summary.flat()).not.toContain('GST Collected'); // 0% GST
    expect(summary).toContainEqual(['Paid by Cash (1 bill)', 220]);
    expect(summary).toContainEqual(['Paid by UPI (1 bill)', 2800]);
    expect(summary).toContainEqual(['Paid by Card (0 bills)', 0]);

    const bills = values(wb.getWorksheet('Bill-wise')!);
    const head = bills.find(r => r[0] === 'Bill No')!;
    expect(head).toEqual(['Bill No', 'Time', 'Table / Parcel', 'Customer', 'Items', 'Subtotal', 'Discount', 'Net Amount', 'Payment']);
    expect(bills).toContainEqual([1, expect.any(String), 'Table 5', 'Saad', 14, 2800, 0, 2800, 'UPI']);
    expect(bills).toContainEqual([2, expect.any(String), 'Parcel TK-1004', 'SAAD', 1, 220, 0, 220, 'CASH']);
    expect(bills[bills.length - 1].slice(0, 8)).toEqual(['TOTAL', '', '', '', 15, 3020, 0, 3020]);

    const items = values(wb.getWorksheet('Item-wise')!);
    expect(items).toContainEqual([1, 'tea', 8, 220, 1760]);
    expect(items).toContainEqual([2, 'coffee', 7, 180, 1260]);
    expect(items[items.length - 1]).toEqual(['', 'TOTAL', 15, '', 3020]);
  });

  test('monthly report: Month-wise and Day-wise sheets', async () => {
    const monthly = { monthlyData: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
      .map(month => ({ month, revenue: month === 'October' ? 7860 : 0, orders: month === 'October' ? 7 : 0 })) };
    await downloadMonthlyReport(monthly, [{ date: '2026-10-27', bills: 3, revenue: 1860, cash: 1860, upi: 0, card: 0 }, { date: '2026-10-28', bills: 4, revenue: 6000, cash: 1000, upi: 3000, card: 2000 }], 2026, restaurant);
    expect(saved!.name).toBe('Monthly_Report_2026.xlsx');
    const wb = await readSaved();
    expect(wb.worksheets.map(w => w.name)).toEqual(['Month-wise', 'Day-wise']);
    const months = values(wb.getWorksheet('Month-wise')!);
    expect(months).toContainEqual(['October', 7, 7860, 7860 / 7, 2860, 3000, 2000]);
    expect(months[months.length - 1]).toEqual(['TOTAL', 7, 7860, 7860 / 7, 2860, 3000, 2000]);
    const days = values(wb.getWorksheet('Day-wise')!);
    expect(days.some(r => r[1] === 'Wednesday' && r[2] === 4 && r[3] === 6000 && r[5] === 1000 && r[6] === 3000 && r[7] === 2000)).toBe(true);
  });
});

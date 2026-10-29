import { describe, expect, test } from 'vitest';
import { receiptText } from '@/components/billing/receipt';

const restaurant = { name: "Sufi's Cafe", address: 'NH-8, Kheda', phone: '9173331535', gstNumber: '24ABCDE1234F1Z5', receiptFooter: 'Thanks... Visit Again...' };
const bill = (gstRate: number, gstAmount: number, extra = {}) => ({
  billNumber: 5007, dailyBillNumber: 3, orderNumber: 1001, orderType: 'dine_in', tableNumber: 5, paymentMode: 'cash',
  createdAt: '2026-10-28T10:00:00Z',
  items: [{ name: 'coffee', quantity: 6, price: 180, total: 1080 }, { name: 'tea', quantity: 7, price: 220, total: 1540 }],
  subtotal: 2620, discountAmount: 0, gstRate, gstAmount, totalAmount: 2620 + gstAmount, ...extra,
});

describe('bill layout', () => {
  test('header from Settings, day-wise bill no, table, item columns and net payable', () => {
    const text = receiptText(bill(0, 0), restaurant);
    expect(text).toContain("SUFI'S CAFE");
    expect(text).toContain('NH-8, Kheda');
    expect(text).toContain('Phone : 9173331535');
    expect(text).toMatch(/Bill No : 3\s+Date : 28-Oct-2026/);
    expect(text).toMatch(/Table No : 5\s+Time :/);
    expect(text).toContain('DESCRIPTION         QTY   RATE    AMOUNT');
    expect(text).toContain('COFFEE                6    180   1080.00');
    expect(text).toContain('TOTAL                13          2620.00');
    expect(text).toMatch(/Net Payable\s+2620\.00/);
    expect(text).toMatch(/E\. & O\. E\.\s+Thanks\.\.\. Visit Again\.\.\./);
    expect(text).not.toMatch(/BILL OF SUPPLY|ORIGINAL|Wtr|Capt|Order#/i);
  });
  test('0% GST: no CGST/SGST lines, but the saved GST number is still printed', () => {
    const text = receiptText(bill(0, 0), restaurant);
    expect(text).toContain('GSTNo.: 24ABCDE1234F1Z5');
    expect(text).not.toMatch(/CGST|SGST/);
  });
  test('no GST number saved: none printed', () => {
    expect(receiptText(bill(0, 0), { ...restaurant, gstNumber: '' })).not.toMatch(/GST/);
  });
  test('5% GST: GST number and CGST + SGST lines', () => {
    const text = receiptText(bill(5, 131), restaurant);
    expect(text).toContain('GSTNo.: 24ABCDE1234F1Z5');
    expect(text).toMatch(/CGST @ 2\.5%\s+65\.50/);
    expect(text).toMatch(/Net Payable\s+2751\.00/);
  });
  test('the same dish from several rounds is printed as one line', () => {
    const text = receiptText(bill(0, 0, { items: [
      { name: 'Coffee', quantity: 1, price: 180, total: 180 },
      { name: 'Tea', quantity: 7, price: 220, total: 1540 },
      { name: 'Coffee', quantity: 6, price: 180, total: 1080 },
    ], subtotal: 2800, totalAmount: 2800 }), restaurant);
    expect(text).toContain('COFFEE                7    180   1260.00');
    expect(text.match(/COFFEE/g)).toHaveLength(1);
    expect(text).toContain('TOTAL                14          2800.00');
  });
  test('parcel bills show the parcel token; old bills fall back to the running number', () => {
    const text = receiptText(bill(0, 0, { orderType: 'takeaway', takeawayToken: 'TK-1004', dailyBillNumber: null }), restaurant);
    expect(text).toContain('Parcel : TK-1004');
    expect(text).toContain('Bill No : 5007');
  });
});

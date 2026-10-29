import { beforeAll, describe, expect, test } from 'vitest';

process.env.CUSTOMER_SESSION_SECRET ||= 'test-secret-that-is-at-least-32-characters-long';
let link: typeof import('../src/server/tableLink');
beforeAll(async () => { link = await import('../src/server/tableLink'); });

const RID = '11111111-1111-1111-1111-111111111111';

describe('table QR keys', () => {
  test('the key printed for a table opens that table', () => {
    expect(link.verifyTableQrKey(RID, 7, link.tableQrKey(RID, 7))).toBe(true);
    expect(link.verifyTableQrKey(RID, 'counter', link.tableQrKey(RID, 'counter'))).toBe(true);
  });

  test('changing the table number in the link is rejected', () => {
    const key7 = link.tableQrKey(RID, 7);
    expect(link.verifyTableQrKey(RID, 3, key7)).toBe(false);
    expect(link.verifyTableQrKey(RID, 'counter', key7)).toBe(false);
    expect(link.verifyTableQrKey(RID, 7, link.tableQrKey(RID, 'counter'))).toBe(false);
  });

  test('missing or malformed keys are rejected', () => {
    for (const bad of [undefined, null, '', 'abc', 123, link.tableQrKey(RID, 7) + 'x']) {
      expect(link.verifyTableQrKey(RID, 7, bad)).toBe(false);
    }
  });

  test('keys differ per restaurant and per table', () => {
    const other = '22222222-2222-2222-2222-222222222222';
    expect(link.tableQrKey(RID, 7)).not.toBe(link.tableQrKey(other, 7));
    expect(link.tableQrKey(RID, 7)).not.toBe(link.tableQrKey(RID, 8));
  });
});

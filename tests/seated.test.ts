import { describe, expect, test, vi } from 'vitest';
vi.mock('@/server/db', () => ({ db: () => ({}), must: (r: any) => r.data, rpc: async () => null }));
import { seatedTable } from '@/server/data';

describe('"Currently Seated" follows the Tables page', () => {
  const openTables = new Set([3, 7]);
  test('checked in at a table with an open order → seated there', () => {
    expect(seatedTable(3, openTables)).toBe(3);
  });
  test('checked in (QR scanned) but no open order on that table → not seated', () => {
    expect(seatedTable(5, openTables)).toBeNull();
  });
  test('never checked in → not seated', () => {
    expect(seatedTable(null, openTables)).toBeNull();
  });
});

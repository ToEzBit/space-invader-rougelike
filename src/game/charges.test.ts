import { describe, expect, it } from 'vitest';
import { rechargeTick } from './charges';

describe('rechargeTick', () => {
  it('refills one charge per cooldown and stops at the max', () => {
    let c = { count: 0, msToNext: 1000 };
    c = rechargeTick(c, 999, 2, 1000);
    expect(c.count).toBe(0);
    c = rechargeTick(c, 2, 2, 1000);
    expect(c).toEqual({ count: 1, msToNext: 999 });
    c = rechargeTick(c, 5000, 2, 1000);
    expect(c).toEqual({ count: 2, msToNext: 1000 });
  });
});

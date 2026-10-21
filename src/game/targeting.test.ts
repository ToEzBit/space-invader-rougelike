import { describe, expect, it } from 'vitest';
import { densestColumn } from './targeting';

describe('densestColumn', () => {
  it('returns the center of the strip with the most targets', () => {
    expect(densestColumn([10, 50, 55, 60, 200], 40)).toBe(60);
  });

  it('returns null with no targets', () => {
    expect(densestColumn([], 40)).toBeNull();
  });
});
